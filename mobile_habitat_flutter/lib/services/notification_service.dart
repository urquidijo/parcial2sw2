import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/models.dart';

class NotificationService extends ChangeNotifier {
  static final NotificationService instance = NotificationService._();
  NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  int _nextId = 100;

  final List<PushAlertItem> _history = [
    PushAlertItem(
      id: 'welcome-1',
      title: 'Bienvenido a Habitat Pro Mobile',
      body:
          'Notificaciones push activas para tus reservas, visitas y contratos digitales.',
      createdAt: DateTime.now(),
      category: 'PUSH',
    ),
  ];

  List<PushAlertItem> get history => List.unmodifiable(_history);

  Future<void> init() async {
    if (_initialized || kIsWeb) {
      _initialized = true;
      return;
    }
    try {
      const androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwinSettings = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );
      const settings = InitializationSettings(
        android: androidSettings,
        iOS: darwinSettings,
      );
      await _plugin.initialize(settings);

      final androidImpl = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await androidImpl?.requestNotificationsPermission();
      _initialized = true;
    } catch (e) {
      debugPrint('[NotificationService] Error inicializando push: $e');
    }
  }

  Future<void> showPush({
    required String title,
    required String body,
    String category = 'RESERVA',
  }) async {
    // Vibración háptica en el dispositivo móvil
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {}

    _history.insert(
      0,
      PushAlertItem(
        id: 'push-${DateTime.now().millisecondsSinceEpoch}',
        title: title,
        body: body,
        createdAt: DateTime.now(),
        category: category,
      ),
    );
    notifyListeners();

    if (kIsWeb) return;
    try {
      if (!_initialized) await init();
      const androidDetails = AndroidNotificationDetails(
        'habitat_pro_channel',
        'Alertas Habitat Pro',
        channelDescription:
            'Notificaciones push de reservas, visitas, contratos e IA de Habitat Pro',
        importance: Importance.max,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
      );
      const darwinDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );
      const details = NotificationDetails(
        android: androidDetails,
        iOS: darwinDetails,
      );
      await _plugin.show(_nextId++, title, body, details);
    } catch (e) {
      debugPrint('[NotificationService] No se pudo mostrar notificación: $e');
    }
  }
}

