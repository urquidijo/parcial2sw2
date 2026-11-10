import 'package:flutter/material.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  NotificationService.instance.onTokenRefreshed = () {
    ApiService.instance.syncFcmTokenWithServer();
  };
  await NotificationService.instance.init();
  await ApiService.instance.restoreSession();
  runApp(const HabitatProMobileApp());
}

class HabitatProMobileApp extends StatefulWidget {
  const HabitatProMobileApp({super.key});

  @override
  State<HabitatProMobileApp> createState() => _HabitatProMobileAppState();
}

class _HabitatProMobileAppState extends State<HabitatProMobileApp> {
  @override
  void initState() {
    super.initState();
    ApiService.instance.addListener(_onAuthChanged);
  }

  void _onAuthChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    ApiService.instance.removeListener(_onAuthChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Habitat Pro Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
          primary: const Color(0xFF2563EB),
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: ApiService.instance.isLoggedIn
          ? const HomeShell()
          : const LoginScreen(),
    );
  }
}
