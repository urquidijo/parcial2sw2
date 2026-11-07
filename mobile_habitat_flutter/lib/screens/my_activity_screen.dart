import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../services/api_service.dart';

class MyActivityScreen extends StatefulWidget {
  final VoidCallback onCatalogRefresh;

  const MyActivityScreen({super.key, required this.onCatalogRefresh});

  @override
  State<MyActivityScreen> createState() => _MyActivityScreenState();
}

class _MyActivityScreenState extends State<MyActivityScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  bool _loading = true;
  List<ReservationItem> _reservations = [];
  List<AppointmentItem> _appointments = [];
  List<ContractItem> _contracts = [];

  final _moneyFmt = NumberFormat.currency(
    locale: 'es_BO',
    symbol: '\$',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.instance.getMyReservations().catchError((_) => <ReservationItem>[]),
        ApiService.instance.getMyAppointments().catchError((_) => <AppointmentItem>[]),
        ApiService.instance.getMyContracts().catchError((_) => <ContractItem>[]),
      ]);
      if (mounted) {
        setState(() {
          _reservations = results[0] as List<ReservationItem>;
          _appointments = results[1] as List<AppointmentItem>;
          _contracts = results[2] as List<ContractItem>;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancelReservation(ReservationItem r) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar y reembolsar arras?'),
        content: Text(
          'Se devolverán tus arras (${_moneyFmt.format(r.depositAmount)} USD), se anulará el pre-contrato y "${r.propertyTitle}" volverá a estar disponible.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Volver'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFBE123C),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, cancelar y reembolsar'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await ApiService.instance.cancelReservation(r.id);
      widget.onCatalogRefresh();
      await _loadAll();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Reserva cancelada y arras reembolsadas.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _signContract(ContractItem c) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Firmar ${c.contractNumber}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Inmueble: ${c.propertyTitle}\nMonto: ${_moneyFmt.format(c.totalAmount)} USD',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            Container(
              constraints: const BoxConstraints(maxHeight: 160),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: SingleChildScrollView(
                child: Text(
                  c.legalClauses.isNotEmpty
                      ? c.legalClauses
                      : 'Cláusulas legales verificadas por Oficialía Legal de Habitat Pro.',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Se generará tu firma electrónica con huella criptográfica SHA-256.',
              style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.draw_rounded, size: 17),
            label: const Text('Firmar digitalmente'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await ApiService.instance.signContract(c);
      await _loadAll();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Contrato ${c.contractNumber} firmado con SHA-256.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al firmar: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: const Color(0xFF2563EB),
            unselectedLabelColor: const Color(0xFF64748B),
            indicatorColor: const Color(0xFF2563EB),
            tabs: [
              Tab(text: 'Reservas (${_reservations.length})'),
              Tab(text: 'Visitas (${_appointments.length})'),
              Tab(text: 'Contratos (${_contracts.length})'),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabCtrl,
                  children: [
                    _buildReservationsTab(),
                    _buildAppointmentsTab(),
                    _buildContractsTab(),
                  ],
                ),
        ),
      ],
    );
  }

  Widget _buildReservationsTab() {
    if (_reservations.isEmpty) {
      return _emptyState(
        icon: Icons.lock_clock_outlined,
        text:
            'Aún no tienes reservas con arras.\nExplora el catálogo para apartar tu inmueble por 48 horas.',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _reservations.length,
        itemBuilder: (_, idx) {
          final r = _reservations[idx];
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      r.id,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: r.isActive
                            ? const Color(0xFFFFFBEB)
                            : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        r.isActive ? 'Activa (48 h)' : r.status,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: r.isActive
                              ? const Color(0xFFB45309)
                              : const Color(0xFF64748B),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  r.propertyTitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Arras en custodia: ${_moneyFmt.format(r.depositAmount)} USD',
                  style: const TextStyle(
                    color: Color(0xFF047857),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (r.isActive) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => _cancelReservation(r),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFBE123C),
                        side: const BorderSide(color: Color(0xFFFECDD3)),
                      ),
                      icon: const Icon(Icons.replay_rounded, size: 17),
                      label: const Text('Cancelar reserva y reembolsar arras'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildAppointmentsTab() {
    if (_appointments.isEmpty) {
      return _emptyState(
        icon: Icons.calendar_today_outlined,
        text:
            'No tienes visitas agendadas.\nAbre un inmueble del catálogo y pulsa "Agendar visita".',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _appointments.length,
        itemBuilder: (_, idx) {
          final a = _appointments[idx];
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${a.visitDate} · ${a.visitTime}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                    Text(
                      a.status,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  a.propertyTitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  a.visitType == 'VIRTUAL_3D'
                      ? 'Modalidad: Recorrido Virtual 3D'
                      : 'Modalidad: Presencial en el inmueble',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF64748B),
                  ),
                ),
                if (a.status == 'CONFIRMADA') ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: () async {
                        await ApiService.instance.cancelAppointment(a.id);
                        await _loadAll();
                      },
                      icon: const Icon(Icons.cancel_outlined, size: 16),
                      label: const Text('Cancelar cita'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildContractsTab() {
    if (_contracts.isEmpty) {
      return _emptyState(
        icon: Icons.description_outlined,
        text: 'Aún no tienes contratos emitidos a tu nombre.',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _contracts.length,
        itemBuilder: (_, idx) {
          final c = _contracts[idx];
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      c.contractNumber,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                    Text(
                      c.status,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  c.propertyTitle.isNotEmpty ? c.propertyTitle : c.propertyId,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Monto: ${_moneyFmt.format(c.totalAmount)} USD · Firmas: ${c.signaturesCount}/${c.signaturesRequired}',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF64748B),
                  ),
                ),
                if (c.canClientSign) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => _signContract(c),
                      icon: const Icon(Icons.draw_rounded, size: 17),
                      label: const Text('Firmar digitalmente (SHA-256)'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _emptyState({required IconData icon, required String text}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: const Color(0xFF94A3B8)),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF64748B),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _loadAll,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Actualizar'),
            ),
          ],
        ),
      ),
    );
  }
}

