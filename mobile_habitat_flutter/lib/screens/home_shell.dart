import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
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
              const SizedBox(height: 10),
              // Botón o Estado de vinculación con Telegram
              SizedBox(
                width: double.infinity,
                child: user?.telegramLinked == true
                    ? OutlinedButton.icon(
                        onPressed: _openTelegramStatusModal,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF059669),
                          side: const BorderSide(color: Color(0xFF10B981)),
                          backgroundColor: const Color(0xFFECFDF5),
                        ),
                        icon: const Icon(Icons.check_circle_rounded, size: 18),
                        label: const Text('Telegram Vinculado · Configurar'),
                      )
                    : OutlinedButton.icon(
                        onPressed: _openTelegramLinkModal,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF0284C7),
                          side: const BorderSide(color: Color(0xFF38BDF8)),
                          backgroundColor: const Color(0xFFF0F9FF),
                        ),
                        icon: const Icon(Icons.send_rounded, size: 18),
                        label: const Text('Vincular a Telegram'),
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

  void _openTelegramStatusModal() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.check_circle_rounded,
                    color: Color(0xFF059669),
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Telegram Vinculado',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              'Tu cuenta de cliente está conectada al bot de Telegram. Recibes confirmaciones de tus reservas de arras, pre-contratos y avisos legales directamente en tu chat.',
              style: TextStyle(fontSize: 14, color: Color(0xFF475569), height: 1.4),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  Navigator.pop(ctx);
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (dCtx) => AlertDialog(
                      title: const Text('¿Desvincular Telegram?'),
                      content: const Text(
                        'Dejarás de recibir notificaciones y comprobantes en tu cuenta de Telegram.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(dCtx, false),
                          child: const Text('Cancelar'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(dCtx, true),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFBE123C),
                          ),
                          child: const Text('Desvincular'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true) {
                    try {
                      await ApiService.instance.unlinkTelegram();
                      if (mounted) {
                        setState(() {});
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Telegram desvinculado con éxito.')),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Error al desvincular: $e')),
                        );
                      }
                    }
                  }
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFBE123C),
                  side: const BorderSide(color: Color(0xFFFDA4AF)),
                ),
                icon: const Icon(Icons.link_off_rounded, size: 18),
                label: const Text('Desvincular mi Telegram'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openTelegramLinkModal() async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    try {
      final info = await ApiService.instance.requestTelegramLink();
      if (!mounted) return;
      Navigator.pop(context); // Cierra loader

      final code = (info['code'] ?? '').toString();
      final link = (info['link'] ?? '').toString();
      final bot = (info['bot'] ?? 'habitat_bot').toString();

      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setModalState) {
            final verifyingNotifier = ValueNotifier<bool>(false);

            return Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                20,
                20,
                28 + MediaQuery.of(ctx).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.send_rounded,
                          color: Color(0xFF0284C7),
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'Vincular mi Telegram',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Vincula tu Telegram para recibir avisos instantáneos de tus reservas, arras y contratos directamente en tu teléfono.',
                    style: TextStyle(fontSize: 13.5, color: Color(0xFF475569)),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Comando de inicio:',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF64748B),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '/start $code',
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: '/start $code'));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Comando copiado al portapapeles')),
                            );
                          },
                          tooltip: 'Copiar comando',
                          icon: const Icon(Icons.copy_rounded, size: 20),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () async {
                        final uri = Uri.parse(link);
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                        } else {
                          // Fallback a web
                          final webUri = Uri.parse('https://t.me/$bot?start=$code');
                          await launchUrl(webUri, mode: LaunchMode.externalApplication);
                        }
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF0284C7),
                      ),
                      icon: const Icon(Icons.open_in_new_rounded, size: 18),
                      label: const Text('1. Abrir Telegram e Iniciar'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ValueListenableBuilder<bool>(
                    valueListenable: verifyingNotifier,
                    builder: (context, isVerifying, child) {
                      return SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: isVerifying
                              ? null
                              : () async {
                                  verifyingNotifier.value = true;
                                  try {
                                    final ok = await ApiService.instance.verifyTelegramLink(code);
                                    if (!ctx.mounted) return;
                                    if (ok) {
                                      Navigator.pop(ctx);
                                      if (mounted) {
                                        setState(() {});
                                        ScaffoldMessenger.of(this.context).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              '¡Telegram vinculado con éxito! Te enviamos un mensaje de confirmación.',
                                            ),
                                          ),
                                        );
                                      }
                                    } else {
                                      verifyingNotifier.value = false;
                                      if (ctx.mounted) {
                                        ScaffoldMessenger.of(ctx).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Aún no recibimos tu mensaje en el bot. Ábrelo en Telegram y pulsa Iniciar.',
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  } catch (e) {
                                    if (!ctx.mounted) return;
                                    verifyingNotifier.value = false;
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(content: Text('Error al verificar: $e')),
                                    );
                                  }
                                },
                          icon: isVerifying
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.verified_rounded, size: 18),
                          label: Text(
                            isVerifying
                                ? 'Verificando con el bot…'
                                : '2. Ya envié /start · Confirmar',
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            );
          },
        ),
      );
    } catch (e) {
      if (!mounted) return;
      Navigator.pop(context); // Cierra loader si seguía abierto
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo iniciar vinculación: $e')),
      );
    }
  }
}

