import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/models.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  debugPrint('[FCM Background] ${message.notification?.title} - ${message.notification?.body}');
}

class NotificationService extends ChangeNotifier {
  static final NotificationService instance = NotificationService._();
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localPlugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  int _nextId = 100;
  String? _fcmToken;
  VoidCallback? onTokenRefreshed;

  String? get fcmToken => _fcmToken;

  final List<PushAlertItem> _history = [
    PushAlertItem(
      id: 'welcome-1',
      title: 'Bienvenido a Habitat Pro Mobile',
      body:
          'Firebase Cloud Messaging activo para tus reservas, visitas y contratos digitales.',
      createdAt: DateTime.now(),
      category: 'PUSH',
    ),
  ];

  List<PushAlertItem> get history => List.unmodifiable(_history);

  Future<void> init() async {
    if (_initialized) return;

    // 1. Inicializar Notificaciones Locales
    if (!kIsWeb) {
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
        await _localPlugin.initialize(settings);

        final androidImpl = _localPlugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        await androidImpl?.requestNotificationsPermission();
      } catch (e) {
        debugPrint('[NotificationService] Error local notifications: $e');
      }
    }

    // 2. Inicializar Firebase y Firebase Cloud Messaging
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      // Solicitar permisos de notificación (Android 13+ e iOS)
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      debugPrint('[FCM] Estado de permisos: ${settings.authorizationStatus}');

      // Obtener el Token FCM del dispositivo
      _fcmToken = await messaging.getToken();
      debugPrint('==================================================');
      debugPrint('🔥 [FCM TOKEN DE TU CELULAR]: $_fcmToken');
      debugPrint('==================================================');
      if (_fcmToken != null) {
        onTokenRefreshed?.call();
      }

      // Escuchar cambios de token
      messaging.onTokenRefresh.listen((newToken) {
        _fcmToken = newToken;
        notifyListeners();
        onTokenRefreshed?.call();
      });

      // Escuchar mensajes push mientras la app está abierta en PRIMER PLANO (Foreground)
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        final notification = message.notification;
        if (notification != null) {
          showPush(
            title: notification.title ?? 'Habitat Pro Alerta',
            body: notification.body ?? '',
            category: (message.data['category'] ?? 'FIREBASE').toString(),
          );
        }
      });

      // Cuando el usuario toca la notificación y abre la app
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('[FCM Tapped] Mensaje abierto desde notificación: ${message.data}');
      });

    } catch (e) {
      debugPrint('[FCM] Firebase no disponible o error de configuración: $e');
    }

    _initialized = true;
    notifyListeners();
  }

  Future<void> showPush({
    required String title,
    required String body,
    String category = 'RESERVA',
  }) async {
    // Vibración háptica en el celular
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
      await _localPlugin.show(_nextId++, title, body, details);
    } catch (e) {
      debugPrint('[NotificationService] No se pudo mostrar notificación: $e');
    }
  }
}
