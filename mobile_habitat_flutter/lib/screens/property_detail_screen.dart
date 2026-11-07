import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/models.dart';
import '../services/api_service.dart';

class PropertyDetailScreen extends StatefulWidget {
  final PropertyItem property;
  final VoidCallback onChanged;

  const PropertyDetailScreen({
    super.key,
    required this.property,
    required this.onChanged,
  });

  @override
  State<PropertyDetailScreen> createState() => _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends State<PropertyDetailScreen> {
  int _photoIndex = 0;
  double _downPaymentPct = 20;
  double _years = 20;
  final double _annualRate = 7.5;

  final _moneyFmt = NumberFormat.currency(
    locale: 'es_BO',
    symbol: '\$',
    decimalDigits: 0,
  );

  double get _monthlyQuota {
    final principal =
        widget.property.price * (1.0 - (_downPaymentPct / 100.0));
    final months = _years * 12;
    final monthlyRate = (_annualRate / 100.0) / 12.0;
    if (months <= 0 || principal <= 0) return 0;
    final factor = math.pow(1 + monthlyRate, months);
    return principal * (monthlyRate * factor) / (factor - 1);
  }

  Future<void> _openMap() async {
    final p = widget.property;
    final query = (p.latitude != null && p.longitude != null)
        ? '${p.latitude},${p.longitude}'
        : Uri.encodeComponent('${p.address}, ${p.zone}, ${p.city}');
    final uri =
        Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _contactWhatsApp() async {
    final p = widget.property;
    final digits = p.brokerPhone.replaceAll(RegExp(r'[^0-9]'), '');
    final text = Uri.encodeComponent(
        'Hola ${p.brokerName}, vi el inmueble "${p.title}" (${p.code}) en la app móvil de Habitat Pro y quisiera más información.');
    final uri = Uri.parse('https://wa.me/$digits?text=$text');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _showScheduleVisitDialog() async {
    final user = ApiService.instance.currentUser;
    final phoneCtrl = TextEditingController(text: user?.phone ?? '+591 70012345');
    final notesCtrl = TextEditingController();
    DateTime selectedDate = DateTime.now().add(const Duration(days: 1));
    String selectedTime = '11:00';
    String selectedType = 'PRESENCIAL';
    bool saving = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          final isoDate = DateFormat('yyyy-MM-dd').format(selectedDate);
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Agendar visita',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                    ),
                    child: Text(
                      '${widget.property.title}\nAsesor: ${widget.property.brokerName}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1E3A8A),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Tu teléfono / WhatsApp',
                      prefixIcon: Icon(Icons.phone_outlined),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: selectedDate,
                              firstDate: DateTime.now(),
                              lastDate:
                                  DateTime.now().add(const Duration(days: 60)),
                            );
                            if (picked != null) {
                              setSheetState(() => selectedDate = picked);
                            }
                          },
                          icon: const Icon(Icons.calendar_today, size: 16),
                          label: Text(isoDate),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: selectedTime,
                          decoration: const InputDecoration(
                            labelText: 'Hora',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                          ),
                          items: const [
                            DropdownMenuItem(
                                value: '09:30', child: Text('09:30')),
                            DropdownMenuItem(
                                value: '11:00', child: Text('11:00')),
                            DropdownMenuItem(
                                value: '15:00', child: Text('15:00')),
                            DropdownMenuItem(
                                value: '16:30', child: Text('16:30')),
                            DropdownMenuItem(
                                value: '18:00', child: Text('18:00')),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              setSheetState(() => selectedTime = v);
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: selectedType,
                    decoration: const InputDecoration(
                      labelText: 'Modalidad de visita',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'PRESENCIAL',
                        child: Text('Presencial en el inmueble'),
                      ),
                      DropdownMenuItem(
                        value: 'VIRTUAL_3D',
                        child: Text('Recorrido virtual guiado (Videollamada)'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setSheetState(() => selectedType = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Notas para el asesor (opcional)',
                      hintText: 'Ej. Quiero revisar planos y folio real',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: saving
                        ? null
                        : () async {
                            setSheetState(() => saving = true);
                            try {
                              await ApiService.instance.scheduleAppointment(
                                property: widget.property,
                                clientPhone: phoneCtrl.text,
                                visitDate: isoDate,
                                visitTime: selectedTime,
                                visitType: selectedType,
                                notes: notesCtrl.text,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              widget.onChanged();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                        '¡Visita agendada! Se envió notificación push.'),
                                  ),
                                );
                              }
                            } catch (e) {
                              setSheetState(() => saving = false);
                              if (ctx.mounted) {
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text('Error: $e')),
                                );
                              }
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: const Icon(Icons.event_available_rounded),
                    label: Text(saving ? 'Agendando…' : 'Confirmar visita'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showReserveSagaDialog() async {
    final user = ApiService.instance.currentUser;
    final phoneCtrl = TextEditingController(text: user?.phone ?? '+591 70012345');
    String paymentMethod = 'Tarjeta de Crédito / Débito';
    bool saving = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Reservar con Arras (48 h)',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.property.title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Precio: ${_moneyFmt.format(widget.property.price)} USD · Arras a depositar: ${_moneyFmt.format(widget.property.deposit)} USD',
                          style: const TextStyle(
                            color: Color(0xFF1D4ED8),
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Teléfono de contacto / WhatsApp *',
                      prefixIcon: Icon(Icons.phone_outlined),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: paymentMethod,
                    decoration: const InputDecoration(
                      labelText: 'Método de pago de arras',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'Tarjeta de Crédito / Débito',
                        child: Text('Tarjeta de crédito o débito'),
                      ),
                      DropdownMenuItem(
                        value: 'Transferencia Interbancaria ACH',
                        child: Text('Transferencia bancaria ACH'),
                      ),
                      DropdownMenuItem(
                        value: 'Custodia Fiduciaria Notarial',
                        child: Text('Custodia fiduciaria notarial'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setSheetState(() => paymentMethod = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                    ),
                    child: const Text(
                      'Arras penitenciales (Art. 537 Código Civil): bloquean el inmueble por 48 h en MongoDB Atlas, registran el cobro en Amazon DynamoDB y emiten tu pre-contrato en PostgreSQL.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF92400E),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: saving
                        ? null
                        : () async {
                            setSheetState(() => saving = true);
                            try {
                              await ApiService.instance.createReservation(
                                property: widget.property,
                                userPhone: phoneCtrl.text,
                                paymentMethod: paymentMethod,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              widget.onChanged();
                              if (mounted) {
                                Navigator.pop(context);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                        '¡Reserva Saga completada con éxito! Revisa tu notificación Push.'),
                                  ),
                                );
                              }
                            } catch (e) {
                              setSheetState(() => saving = false);
                              if (ctx.mounted) {
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text('$e')),
                                );
                              }
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF047857),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: const Icon(Icons.verified_rounded),
                    label: Text(
                      saving
                          ? 'Ejecutando Saga en 3 Nubes…'
                          : 'Confirmar reserva (${_moneyFmt.format(widget.property.deposit)} USD)',
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showInquiryDialog() async {
    final user = ApiService.instance.currentUser;
    final phoneCtrl = TextEditingController(text: user?.phone ?? '+591 70012345');
    final msgCtrl = TextEditingController();
    bool saving = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Consultar al asesor',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneCtrl,
                decoration: const InputDecoration(
                  labelText: 'Teléfono de contacto',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: msgCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Tu consulta sobre el inmueble *',
                  hintText: 'Ej. ¿Aceptan financiamiento bancario o permuta?',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: saving
                    ? null
                    : () async {
                        if (msgCtrl.text.trim().isEmpty) return;
                        setSheetState(() => saving = true);
                        try {
                          await ApiService.instance.sendInquiry(
                            property: widget.property,
                            message: msgCtrl.text,
                            phone: phoneCtrl.text,
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Consulta enviada al asesor.'),
                              ),
                            );
                          }
                        } catch (e) {
                          setSheetState(() => saving = false);
                        }
                      },
                icon: const Icon(Icons.send_rounded),
                label: Text(saving ? 'Enviando…' : 'Enviar consulta'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.property;
    final gallery = p.gallery;
    final isFav = ApiService.instance.isFavorite(p.code);

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(p.code, style: const TextStyle(fontSize: 15)),
        actions: [
          IconButton(
            onPressed: () async {
              await ApiService.instance.toggleFavorite(p);
              setState(() {});
            },
            icon: Icon(
              isFav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              color: isFav ? const Color(0xFFBE123C) : null,
            ),
          ),
          IconButton(
            onPressed: _openMap,
            tooltip: 'Ver en Google Maps',
            icon: const Icon(Icons.map_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 100),
        children: [
          // Galería de fotos desde Amazon S3 (sw2p2)
          SizedBox(
            height: 260,
            child: Stack(
              children: [
                PageView.builder(
                  itemCount: gallery.length,
                  onPageChanged: (idx) => setState(() => _photoIndex = idx),
                  itemBuilder: (_, idx) => Image.network(
                    gallery[idx],
                    fit: BoxFit.cover,
                    width: double.infinity,
                    errorBuilder: (_, __, ___) => Container(
                      color: const Color(0xFFE2E8F0),
                      child: const Center(
                        child: Icon(Icons.apartment, size: 54),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 14,
                  left: 14,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: p.isAvailable
                          ? const Color(0xFFECFDF5)
                          : const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      p.isAvailable ? 'Disponible' : p.status,
                      style: TextStyle(
                        color: p.isAvailable
                            ? const Color(0xFF047857)
                            : const Color(0xFFB45309),
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 12,
                  right: 14,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.65),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'S3 · ${_photoIndex + 1}/${gallery.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${_moneyFmt.format(p.price)} USD',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Arras: ${_moneyFmt.format(p.deposit)} USD',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  p.title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined,
                        size: 17, color: Color(0xFF64748B)),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        '${p.zone}, ${p.city} · ${p.address}',
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 13.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Especificaciones
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _SpecCol(
                          icon: Icons.square_foot_rounded,
                          value: '${p.area.toStringAsFixed(0)} m²',
                          label: 'Superficie'),
                      _SpecCol(
                          icon: Icons.bed_outlined,
                          value: '${p.bedrooms}',
                          label: 'Dormitorios'),
                      _SpecCol(
                          icon: Icons.bathtub_outlined,
                          value: '${p.bathrooms}',
                          label: 'Baños'),
                      _SpecCol(
                          icon: Icons.directions_car_outlined,
                          value: '${p.parking}',
                          label: 'Parqueos'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                if (p.description.isNotEmpty) ...[
                  const Text(
                    'Descripción del inmueble',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    p.description,
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.5,
                      color: Color(0xFF334155),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                if (p.amenities.isNotEmpty) ...[
                  const Text(
                    'Comodidades y equipamiento',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: p.amenities
                        .map((a) => Chip(
                              label: Text(a,
                                  style: const TextStyle(fontSize: 12.5)),
                              backgroundColor: Colors.white,
                              side:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                ],

                // Tarjeta del Asesor + Contacto
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: Color(0xFFEFF6FF),
                        child: Icon(Icons.support_agent,
                            color: Color(0xFF2563EB)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.brokerName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 14.5),
                            ),
                            Text(
                              'Asesor asignado · ${p.brokerPhone}',
                              style: const TextStyle(
                                  color: Color(0xFF64748B), fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                      IconButton.filledTonal(
                        onPressed: _showInquiryDialog,
                        tooltip: 'Enviar consulta',
                        icon: const Icon(Icons.chat_bubble_outline, size: 19),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        onPressed: _contactWhatsApp,
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0xFF059669),
                        ),
                        tooltip: 'WhatsApp',
                        icon: const Icon(Icons.phone_in_talk_rounded, size: 19),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // Calculadora Hipotecaria Interactiva
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
                      const Row(
                        children: [
                          Icon(Icons.calculate_outlined,
                              color: Color(0xFF2563EB)),
                          SizedBox(width: 8),
                          Text(
                            'Simulador de Cuota Hipotecaria',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Cuota inicial:'),
                          Text(
                            '${_downPaymentPct.round()}% (${_moneyFmt.format(p.price * _downPaymentPct / 100)} USD)',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                      Slider(
                        value: _downPaymentPct,
                        min: 10,
                        max: 70,
                        divisions: 12,
                        onChanged: (v) => setState(() => _downPaymentPct = v),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Plazo del crédito:'),
                          Text(
                            '${_years.round()} años · Tasa $_annualRate%',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                      Slider(
                        value: _years,
                        min: 5,
                        max: 30,
                        divisions: 5,
                        onChanged: (v) => setState(() => _years = v),
                      ),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            const Text(
                              'Cuota mensual estimada',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Color(0xFF1E3A8A),
                              ),
                            ),
                            Text(
                              '${_moneyFmt.format(_monthlyQuota)} USD / mes',
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF2563EB),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
          ),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: p.isAvailable ? _showScheduleVisitDialog : null,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: const Icon(Icons.calendar_month_outlined, size: 18),
                  label: const Text('Agendar visita'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: p.isAvailable ? _showReserveSagaDialog : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: const Icon(Icons.lock_clock_outlined, size: 18),
                  label: Text(
                    p.isAvailable ? 'Reservar con arras' : 'No disponible',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SpecCol extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;

  const _SpecCol({
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 20, color: const Color(0xFF2563EB)),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
        Text(
          label,
          style: const TextStyle(color: Color(0xFF64748B), fontSize: 11.5),
        ),
      ],
    );
  }
}

