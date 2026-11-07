import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import 'ai_hub_screen.dart';
import 'catalog_screen.dart';
import 'my_activity_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tabIndex = 0;
  bool _loadingCatalog = true;
  List<PropertyItem> _properties = [];

  @override
  void initState() {
    super.initState();
    _loadProperties();
    NotificationService.instance.addListener(_onNotificationsChanged);
  }

  void _onNotificationsChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    NotificationService.instance.removeListener(_onNotificationsChanged);
    super.dispose();
  }

  Future<void> _loadProperties() async {
    setState(() => _loadingCatalog = true);
    try {
      final list = await ApiService.instance.getProperties();
      if (mounted) {
        setState(() {
          _properties = list;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al cargar catálogo: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingCatalog = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ApiService.instance.currentUser;
    final alerts = NotificationService.instance.history;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1,
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.apartment_rounded,
                color: Colors.white,
                size: 19,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Habitat Pro',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  Text(
                    'Cliente · ${user?.name ?? "Invitado"}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: Color(0xFF64748B),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => setState(() => _tabIndex = 3),
            tooltip: 'Centro de notificaciones Push',
            icon: Badge(
              label: Text('${alerts.length}'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
          IconButton(
            onPressed: _loadProperties,
            tooltip: 'Actualizar catálogo',
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            onPressed: () async {
              await ApiService.instance.logout();
            },
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout_rounded, color: Color(0xFFBE123C)),
          ),
        ],
      ),
      body: IndexedStack(
        index: _tabIndex,
        children: [
          CatalogScreen(
            properties: _properties,
            loading: _loadingCatalog,
            onRefresh: _loadProperties,
          ),
          MyActivityScreen(
            onCatalogRefresh: _loadProperties,
          ),
          AiHubScreen(
            properties: _properties,
            onCatalogRefresh: _loadProperties,
          ),
          _buildNotificationsAndProfileTab(user, alerts),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFFDBEAFE),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_work_outlined),
            selectedIcon:
                Icon(Icons.home_work_rounded, color: Color(0xFF2563EB)),
            label: 'Explorar',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon:
                Icon(Icons.assignment_rounded, color: Color(0xFF2563EB)),
            label: 'Actividad',
          ),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon:
                Icon(Icons.auto_awesome_rounded, color: Color(0xFF2563EB)),
            label: 'IA & Cámara',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_active_outlined),
            selectedIcon: Icon(Icons.notifications_active_rounded,
                color: Color(0xFF2563EB)),
            label: 'Alertas Push',
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationsAndProfileTab(
    UserProfile? user,
    List<PushAlertItem> alerts,
  ) {
    final dateFmt = DateFormat('dd/MM HH:mm');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Tarjeta de Perfil + Botón Probar Push
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: const Color(0xFFEFF6FF),
                    child: Text(
                      user?.initials ?? 'CL',
                      style: const TextStyle(
                        color: Color(0xFF2563EB),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'Cliente Habitat Pro',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          '${user?.email ?? ""} · Modo Cliente Activo',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () async {
                    await ApiService.instance.triggerServerPushTest();
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                  ),
                  icon: const Icon(Icons.notifications_active_rounded, size: 18),
                  label: const Text('Enviar notificación Push de prueba'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Historial de Notificaciones Push en este dispositivo',
          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 10),
        ...alerts.map(
          (a) => Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.notifications_active_outlined,
                    color: Color(0xFF2563EB),
                    size: 18,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              a.title,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                          Text(
                            dateFmt.format(a.createdAt),
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        a.body,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF475569),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

