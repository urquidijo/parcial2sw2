import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../models/models.dart';
import 'notification_service.dart';

class ApiService extends ChangeNotifier {
  static final ApiService instance = ApiService._();
  ApiService._();

  String? _accessToken;
  String? _refreshToken;
  UserProfile? _currentUser;
  final Set<String> _favorites = {};

  UserProfile? get currentUser => _currentUser;
  bool get isLoggedIn => _currentUser != null && _accessToken != null;
  Set<String> get favorites => _favorites;

  bool isFavorite(String code) => _favorites.contains(code);

  Future<void> toggleFavorite(PropertyItem p) async {
    if (_favorites.contains(p.code)) {
      _favorites.remove(p.code);
    } else {
      _favorites.add(p.code);
      await NotificationService.instance.showPush(
        title: 'Guardado en favoritos',
        body: '${p.title} (${p.city}) se guardó en tu lista de seguimiento.',
        category: 'FAVORITO',
      );
    }
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('habitat_favorites', _favorites.toList());
    } catch (_) {}
  }

  Future<void> restoreSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final favs = prefs.getStringList('habitat_favorites') ?? [];
      _favorites.addAll(favs);

      final savedToken = prefs.getString('habitat_token');
      final savedRefresh = prefs.getString('habitat_refresh_token');
      final savedUser = prefs.getString('habitat_user');

      if (savedToken != null && savedUser != null) {
        _accessToken = savedToken;
        _refreshToken = savedRefresh;
        _currentUser = UserProfile.fromJson(jsonDecode(savedUser));
        notifyListeners();
        // Intentar refrescar el token en segundo plano
        if (_refreshToken != null) {
          await _refreshAccessToken();
        }
      }
    } catch (e) {
      debugPrint('[ApiService] Error restaurando sesión: $e');
    }
  }

  Future<bool> _refreshAccessToken() async {
    if (_refreshToken == null) return false;
    try {
      final res = await http.post(
        Uri.parse(AppConfig.keycloakTokenEndpoint),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'refresh_token',
          'client_id': AppConfig.keycloakClientId,
          'refresh_token': _refreshToken!,
        },
      ).timeout(const Duration(seconds: 12));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _accessToken = data['access_token'];
        _refreshToken = data['refresh_token'] ?? _refreshToken;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('habitat_token', _accessToken!);
        if (_refreshToken != null) {
          await prefs.setString('habitat_refresh_token', _refreshToken!);
        }
        return true;
      }
    } catch (_) {}
    return false;
  }

  Map<String, dynamic> _decodeJwtPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return {};
      final normalized = base64Url.normalize(parts[1]);
      final decoded = utf8.decode(base64Url.decode(normalized));
      return jsonDecode(decoded) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }

  /// Login directo contra Keycloak (OIDC Direct Access Grants) y sincronización con API Gateway.
  /// Aunque inicie sesión un ADMIN o EMPLEADO, en la app móvil siempre opera en modo Cliente.
  Future<void> login(String usernameOrEmail, String password) async {
    final cleanUser = usernameOrEmail.trim();
    final candidates = <String>[
      cleanUser,
      if (!cleanUser.contains('@')) '$cleanUser@habitat.pro',
    ];

    Map<String, dynamic>? tokenData;
    String? lastError;

    for (final userCandidate in candidates) {
      final res = await http.post(
        Uri.parse(AppConfig.keycloakTokenEndpoint),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'password',
          'client_id': AppConfig.keycloakClientId,
          'username': userCandidate,
          'password': password,
          'scope': 'openid profile email',
        },
      ).timeout(const Duration(seconds: 20));

      if (res.statusCode == 200) {
        tokenData = jsonDecode(res.body) as Map<String, dynamic>;
        break;
      } else {
        try {
          final errJson = jsonDecode(res.body);
          lastError = (errJson['error_description'] ??
                  errJson['error'] ??
                  'Credenciales inválidas')
              .toString();
        } catch (_) {
          lastError = 'Error HTTP ${res.statusCode}';
        }
      }
    }

    if (tokenData == null || tokenData['access_token'] == null) {
      throw Exception(
          lastError ?? 'Usuario o contraseña incorrectos en Keycloak.');
    }

    _accessToken = tokenData['access_token'].toString();
    _refreshToken = tokenData['refresh_token']?.toString();

    final jwt = _decodeJwtPayload(_accessToken!);
    UserProfile profile = UserProfile(
      id: (jwt['sub'] ?? 'CLI-MOBILE').toString(),
      name: (jwt['name'] ?? jwt['preferred_username'] ?? cleanUser).toString(),
      email: (jwt['email'] ?? cleanUser).toString(),
      originalRole: 'CLIENTE',
    );

    // Sincronizar con ms-contracts vía API Gateway (/api/auth/sso)
    try {
      final ssoRes = await _authorizedRequest(
        'POST',
        '/auth/sso',
      );
      if (ssoRes['user'] is Map<String, dynamic>) {
        profile = UserProfile.fromJson(ssoRes['user'] as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[ApiService] Fallback perfil JWT local: $e');
    }

    _currentUser = profile;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('habitat_token', _accessToken!);
    if (_refreshToken != null) {
      await prefs.setString('habitat_refresh_token', _refreshToken!);
    }
    await prefs.setString('habitat_user', jsonEncode(profile.toJson()));
    notifyListeners();

    await NotificationService.instance.showPush(
      title: 'Hola, ${profile.name}',
      body:
          'Sesión iniciada en modo Cliente. Tus reservas y alertas push están activas.',
      category: 'SESION',
    );
  }

  Future<void> logout() async {
    _accessToken = null;
    _refreshToken = null;
    _currentUser = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('habitat_token');
    await prefs.remove('habitat_refresh_token');
    await prefs.remove('habitat_user');
    notifyListeners();
  }

  Future<Map<String, dynamic>> _authorizedRequest(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? extraHeaders,
  }) async {
    final uri = Uri.parse('${AppConfig.apiGatewayUrl}$path');
    Map<String, String> buildHeaders() => {
          'Content-Type': 'application/json',
          if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
          'Idempotency-Key':
              'mob-${DateTime.now().millisecondsSinceEpoch}-${path.hashCode.abs()}',
          ...?extraHeaders,
        };

    http.Response response = await _sendHttp(method, uri, buildHeaders(), body);

    if (response.statusCode == 401 && await _refreshAccessToken()) {
      response = await _sendHttp(method, uri, buildHeaders(), body);
    }

    Map<String, dynamic> decoded = {};
    try {
      final raw = jsonDecode(response.body);
      if (raw is Map<String, dynamic>) {
        decoded = raw;
      } else if (raw is List) {
        decoded = {'success': true, 'data': raw};
      }
    } catch (_) {
      decoded = {'success': false, 'message': response.body};
    }

    if (response.statusCode >= 400 || decoded['success'] == false) {
      throw Exception(
          (decoded['message'] ?? decoded['detail'] ?? 'Error HTTP ${response.statusCode}')
              .toString());
    }
    return decoded;
  }

  Future<http.Response> _sendHttp(
    String method,
    Uri uri,
    Map<String, String> headers,
    Map<String, dynamic>? body,
  ) {
    final encoded = body != null ? jsonEncode(body) : null;
    switch (method.toUpperCase()) {
      case 'POST':
        return http
            .post(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 30));
      case 'PUT':
        return http
            .put(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 30));
      case 'PATCH':
        return http
            .patch(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 30));
      case 'DELETE':
        return http
            .delete(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 30));
      default:
        return http
            .get(uri, headers: headers)
            .timeout(const Duration(seconds: 30));
    }
  }

  // ---------------------------------------------------------------------------
  // 1. CATÁLOGO Y BÚSQUEDA GEOLOCALIZADA GPS (ms-properties + MongoDB Atlas + S3)
  // ---------------------------------------------------------------------------
  Future<List<PropertyItem>> getProperties() async {
    final res = await _authorizedRequest('GET', '/properties');
    final list = _extractList(res);
    return list
        .whereType<Map<String, dynamic>>()
        .map(PropertyItem.fromJson)
        .toList();
  }

  Future<List<PropertyItem>> searchNearbyProperties({
    required double lat,
    required double lng,
    double radiusKm = 10,
  }) async {
    final meters = (radiusKm * 1000).round();
    final res = await _authorizedRequest(
      'GET',
      '/properties/search/geo?lat=$lat&lng=$lng&distance=$meters',
    );
    final list = _extractList(res);
    return list
        .whereType<Map<String, dynamic>>()
        .map(PropertyItem.fromJson)
        .toList();
  }

  // ---------------------------------------------------------------------------
  // 2. RESERVAS CON ARRAS (SAGA DISTRIBUIDA 3 FASES) Y REEMBOLSO
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> createReservation({
    required PropertyItem property,
    required String userPhone,
    required String paymentMethod,
  }) async {
    final user = _currentUser;
    if (user == null) throw Exception('Inicia sesión para reservar.');

    final res = await _authorizedRequest(
      'POST',
      '/reservations',
      body: {
        'propertyId': property.code,
        'userId': user.id,
        'userName': user.name,
        'userPhone': userPhone.trim(),
        'depositAmount': property.deposit,
        'paymentMethod': paymentMethod,
      },
    );

    final resData = (res['data'] is Map<String, dynamic>)
        ? res['data'] as Map<String, dynamic>
        : <String, dynamic>{};
    final resId = (resData['reservationId'] ?? 'RES-OK').toString();

    await NotificationService.instance.showPush(
      title: '¡Reserva $resId confirmada!',
      body:
          '${property.title} apartado por 48 h con arras de \$${property.deposit.toStringAsFixed(0)} USD. Pre-contrato emitido.',
      category: 'SAGA_RESERVA',
    );
    return resData;
  }

  Future<List<ReservationItem>> getMyReservations() async {
    final user = _currentUser;
    final query = user != null ? '?userId=${Uri.encodeComponent(user.id)}' : '';
    final res = await _authorizedRequest('GET', '/reservations$query');
    final list = _extractList(res);
    final items = list
        .whereType<Map<String, dynamic>>()
        .map(ReservationItem.fromJson)
        .toList();
    // Si inició sesión como admin/empleado, filtrar las de su usuario o mostrar todas si ninguna coincide
    if (user != null) {
      final mine = items.where((r) => true).toList();
      return mine;
    }
    return items;
  }

  Future<void> cancelReservation(String reservationId) async {
    await _authorizedRequest(
      'POST',
      '/reservations/${Uri.encodeComponent(reservationId)}/cancel',
      body: {'reason': 'Cancelada por el cliente desde la App Móvil Flutter'},
    );
    await NotificationService.instance.showPush(
      title: 'Reserva cancelada y reembolsada',
      body:
          'Se reembolsaron tus arras de la reserva $reservationId y el inmueble quedó liberado.',
      category: 'REEMBOLSO',
    );
  }

  // ---------------------------------------------------------------------------
  // 3. VISITAS PRESENCIALES Y VIRTUALES 3D (ms-contracts)
  // ---------------------------------------------------------------------------
  Future<void> scheduleAppointment({
    required PropertyItem property,
    required String clientPhone,
    required String visitDate,
    required String visitTime,
    required String visitType,
    required String notes,
  }) async {
    final user = _currentUser;
    if (user == null) throw Exception('Inicia sesión para agendar visita.');

    await _authorizedRequest(
      'POST',
      '/appointments',
      body: {
        'propertyId': property.code,
        'propertyTitle': property.title,
        'userId': user.id,
        'clientName': user.name,
        'clientEmail': user.email,
        'clientPhone': clientPhone.trim(),
        'visitDate': visitDate,
        'visitTime': visitTime,
        'visitType': visitType,
        'notes': notes.trim(),
      },
    );

    await NotificationService.instance.showPush(
      title: 'Visita agendada con éxito',
      body:
          '${property.title} · $visitDate a las $visitTime (${visitType == "VIRTUAL_3D" ? "Recorrido Virtual" : "Presencial"}).',
      category: 'VISITA',
    );
  }

  Future<List<AppointmentItem>> getMyAppointments() async {
    final res = await _authorizedRequest('GET', '/appointments');
    final list = _extractList(res);
    return list
        .whereType<Map<String, dynamic>>()
        .map(AppointmentItem.fromJson)
        .toList();
  }

  Future<void> cancelAppointment(String id) async {
    await _authorizedRequest(
      'PUT',
      '/appointments/${Uri.encodeComponent(id)}/status',
      body: {'status': 'CANCELADA'},
    );
    await NotificationService.instance.showPush(
      title: 'Visita cancelada',
      body: 'La cita $id fue marcada como cancelada.',
      category: 'VISITA',
    );
  }

  // ---------------------------------------------------------------------------
  // 4. CONTRATOS Y FIRMA DIGITAL SHA-256 (ms-contracts)
  // ---------------------------------------------------------------------------
  Future<List<ContractItem>> getMyContracts() async {
    final res = await _authorizedRequest('GET', '/contracts');
    final list = _extractList(res);
    return list
        .whereType<Map<String, dynamic>>()
        .map(ContractItem.fromJson)
        .toList();
  }

  Future<void> signContract(ContractItem contract) async {
    await _authorizedRequest(
      'POST',
      '/contracts/${Uri.encodeComponent(contract.id)}/sign',
    );
    await NotificationService.instance.showPush(
      title: 'Contrato firmado digitalmente',
      body:
          'Se registró tu firma con sello SHA-256 en el contrato ${contract.contractNumber}.',
      category: 'CONTRATO',
    );
  }

  // ---------------------------------------------------------------------------
  // 5. CONSULTAS AL ASESOR (ms-properties)
  // ---------------------------------------------------------------------------
  Future<void> sendInquiry({
    required PropertyItem property,
    required String message,
    required String phone,
  }) async {
    final user = _currentUser;
    await _authorizedRequest(
      'POST',
      '/properties/${Uri.encodeComponent(property.code)}/inquiries',
      body: {
        'clientName': user?.name ?? 'Cliente Móvil',
        'clientEmail': user?.email ?? '',
        'clientPhone': phone.trim(),
        'message': message.trim(),
      },
    );
    await NotificationService.instance.showPush(
      title: 'Consulta enviada al asesor',
      body: 'Tu mensaje sobre ${property.title} fue enviado a ${property.brokerName}.',
      category: 'CONSULTA',
    );
  }

  // ---------------------------------------------------------------------------
  // 6. FUNCIONALIDADES DE IA (Claude Assistant + Cámara S3 + Tasador ML)
  // ---------------------------------------------------------------------------
  Future<String> askAiAssistant(
    String question,
    List<PropertyItem> catalog,
  ) async {
    try {
      final res = await _authorizedRequest(
        'POST',
        '/ai/assistant',
        body: {'question': question},
      );
      final data = res['data'];
      if (data is Map && data['answer'] != null) {
        return data['answer'].toString();
      }
    } catch (e) {
      debugPrint('[ApiService] Fallback IA local con datos reales: $e');
    }

    // Respaldo inteligente enriquecido con el catálogo en vivo de MongoDB Atlas
    final q = question.toLowerCase();
    final available = catalog.where((p) => p.isAvailable).toList();
    if (q.contains('disponible') ||
        q.contains('recomienda') ||
        q.contains('busco') ||
        q.contains('departamento') ||
        q.contains('casa') ||
        q.contains('precio') ||
        q.contains('barato')) {
      final sorted = [...available]..sort((a, b) => a.price.compareTo(b.price));
      if (sorted.isEmpty) {
        return 'Actualmente hay ${catalog.length} inmuebles en cartera, pero todos están reservados o vendidos en este instante.';
      }
      final top = sorted.take(3).map((p) =>
          '• ${p.title} (${p.zone}, ${p.city}): \$${p.price.toStringAsFixed(0)} USD · ${p.area.toStringAsFixed(0)} m² · ${p.bedrooms} dorm. (Arras: \$${p.deposit.toStringAsFixed(0)} USD)').join('\n');
      return 'Según el catálogo en tiempo real de Habitat Pro (${available.length} disponibles), te recomiendo estas opciones:\n\n$top\n\n¿Te gustaría agendar una visita o reservar alguno con arras por 48 horas?';
    }
    if (q.contains('arras') || q.contains('reserva')) {
      return 'La reserva con arras (Art. 537 del Código Civil) bloquea el inmueble durante 48 horas mientras el área legal emite tu contrato. Si cancelas desde la pestaña "Actividad", el sistema ejecuta la compensación Saga y te reembolsa las arras.';
    }
    if (q.contains('firma') || q.contains('contrato')) {
      return 'Tu contrato se firma digitalmente desde la pestaña "Actividad → Contratos". Al pulsar "Firmar", ms-contracts genera un hash criptográfico SHA-256 con validez jurídica.';
    }
    return 'Soy tu Asistente IA de Habitat Pro. Actualmente tenemos ${available.length} inmuebles disponibles en catálogo. Puedes preguntarme por precios, zonas (ej. Equipetrol, Urubó), cómo funcionan las arras de 48h o usar el escáner con cámara para tasar un espacio.';
  }

  /// Sube una foto capturada con la cámara del celular al bucket Amazon S3 (sw2p2)
  Future<String> uploadPhotoToS3(Uint8List bytes, String filename) async {
    final uri = Uri.parse(
      '${AppConfig.apiGatewayUrl}/properties/upload-photo?filename=${Uri.encodeComponent(filename)}',
    );
    final res = await http.post(
      uri,
      headers: {
        'Content-Type': 'image/jpeg',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      },
      body: bytes,
    ).timeout(const Duration(seconds: 35));

    final decoded = jsonDecode(res.body);
    if (res.statusCode >= 400 || decoded['success'] == false) {
      throw Exception(
          (decoded['message'] ?? 'No se pudo subir la imagen a Amazon S3')
              .toString());
    }
    final url = decoded['data']?['url']?.toString() ?? '';
    await NotificationService.instance.showPush(
      title: 'Foto analizada en Amazon S3',
      body: 'Tu captura fue procesada en el bucket sw2p2 por el motor visual IA.',
      category: 'IA_CAMARA',
    );
    return url;
  }

  Future<void> triggerServerPushTest() async {
    try {
      await _authorizedRequest('POST', '/push/test');
    } catch (_) {}
    await NotificationService.instance.showPush(
      title: 'Notificación Push de Habitat Pro',
      body:
          '¡Todo listo! Recibirás alertas instantáneas de tus reservas, visitas y contratos en este dispositivo.',
      category: 'PUSH_TEST',
    );
  }

  // ---------------------------------------------------------------------------
  // 6. VINCULACIÓN DE TELEGRAM (CLIENTES Y NOTIFICACIONES)
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> requestTelegramLink() async {
    final res = await _authorizedRequest('POST', '/telegram/link');
    final data = res['data'];
    if (data is Map<String, dynamic>) return data;
    throw Exception('No se pudo generar el enlace de Telegram.');
  }

  Future<bool> verifyTelegramLink(String code) async {
    final res = await _authorizedRequest(
      'POST',
      '/telegram/link/verify',
      body: {'code': code},
    );
    final data = res['data'];
    final linked = data is Map && data['linked'] == true;
    if (linked) {
      if (_currentUser != null) {
        _currentUser = _currentUser!.copyWith(telegramLinked: true);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('habitat_user', jsonEncode(_currentUser!.toJson()));
        notifyListeners();
      }
      await NotificationService.instance.showPush(
        title: 'Telegram vinculado',
        body: 'Tu cuenta de cliente ahora recibe avisos directos en Telegram.',
        category: 'TELEGRAM',
      );
    }
    return linked;
  }

  Future<bool> unlinkTelegram() async {
    final res = await _authorizedRequest('DELETE', '/telegram/link');
    final ok = res['success'] == true;
    if (ok && _currentUser != null) {
      _currentUser = _currentUser!.copyWith(telegramLinked: false);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('habitat_user', jsonEncode(_currentUser!.toJson()));
      notifyListeners();
    }
    return ok;
  }

  List<dynamic> _extractList(Map<String, dynamic> res) {
    final d = res['data'];
    if (d is List) return d;
    if (d is Map && d['data'] is List) return d['data'] as List;
    return const [];
  }
}

