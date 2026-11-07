import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import 'property_detail_screen.dart';

class CatalogScreen extends StatefulWidget {
  final List<PropertyItem> properties;
  final bool loading;
  final VoidCallback onRefresh;

  const CatalogScreen({
    super.key,
    required this.properties,
    required this.loading,
    required this.onRefresh,
  });

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _searchCtrl = TextEditingController();
  final stt.SpeechToText _speech = stt.SpeechToText();

  bool _isListening = false;
  bool _locatingGps = false;
  List<PropertyItem>? _nearbyResults;
  String _selectedFilter = 'DISPONIBLES'; // TODOS, DISPONIBLES, DEPARTAMENTO, CASA, FAVORITOS

  final _moneyFmt = NumberFormat.currency(
    locale: 'es_BO',
    symbol: '\$',
    decimalDigits: 0,
  );

  Future<void> _toggleVoiceSearch() async {
    if (_isListening) {
      await _speech.stop();
      setState(() => _isListening = false);
      return;
    }

    try {
      final available = await _speech.initialize(
        onStatus: (status) {
          if (status == 'done' || status == 'notListening') {
            if (mounted) setState(() => _isListening = false);
          }
        },
        onError: (_) {
          if (mounted) setState(() => _isListening = false);
        },
      );

      if (!available) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                  'Reconocimiento de voz no disponible o permiso de micrófono denegado.'),
            ),
          );
        }
        return;
      }

      setState(() => _isListening = true);
      await _speech.listen(
        localeId: 'es_BO',
        onResult: (result) {
          if (mounted) {
            setState(() {
              _searchCtrl.text = result.recognizedWords;
            });
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isListening = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al iniciar micrófono: $e')),
        );
      }
    }
  }

  Future<void> _searchNearMeGps() async {
    setState(() => _locatingGps = true);
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Activa el GPS de tu celular para buscar cerca de ti.');
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Permiso de ubicación GPS denegado.');
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      ).timeout(const Duration(seconds: 12));

      final items = await ApiService.instance.searchNearbyProperties(
        lat: pos.latitude,
        lng: pos.longitude,
        radiusKm: 15,
      );

      setState(() {
        _nearbyResults = items;
      });

      await NotificationService.instance.showPush(
        title: 'Búsqueda GPS completada',
        body:
            'Se encontraron ${items.length} inmueble(s) cerca de tu ubicación actual.',
        category: 'GPS',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _locatingGps = false);
    }
  }

  List<PropertyItem> get _filteredProperties {
    final source = _nearbyResults ?? widget.properties;
    final q = _searchCtrl.text.trim().toLowerCase();

    return source.where((p) {
      if (_selectedFilter == 'DISPONIBLES' && !p.isAvailable) return false;
      if (_selectedFilter == 'DEPARTAMENTO' &&
          !p.propertyType.toUpperCase().contains('DEPARTAMENTO')) {
        return false;
      }
      if (_selectedFilter == 'CASA' &&
          !p.propertyType.toUpperCase().contains('CASA')) {
        return false;
      }
      if (_selectedFilter == 'FAVORITOS' &&
          !ApiService.instance.isFavorite(p.code)) {
        return false;
      }
      if (q.isNotEmpty) {
        final hay =
            '${p.title} ${p.zone} ${p.city} ${p.code} ${p.propertyType}'
                .toLowerCase();
        if (!hay.contains(q)) return false;
      }
      return true;
    }).toList();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredProperties;
    final availableCount =
        widget.properties.where((p) => p.isAvailable).length;

    return RefreshIndicator(
      onRefresh: () async {
        setState(() => _nearbyResults = null);
        widget.onRefresh();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
        children: [
          // Banner de bienvenida de cliente
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFEFF6FF), Colors.white],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFBFDBFE)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Inmuebles verificados en tiempo real',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$availableCount disponibles de ${widget.properties.length} en cartera · Reserva por 48 h con arras',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: Color(0xFF475569),
                        ),
                      ),
                    ],
                  ),
                ),
                FilledButton.tonalIcon(
                  onPressed: _locatingGps ? null : _searchNearMeGps,
                  icon: _locatingGps
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.my_location_rounded, size: 16),
                  label: Text(
                    _locatingGps ? 'GPS…' : 'Cerca de mí',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Buscador con Micrófono (Voz)
          TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: _isListening
                  ? 'Escuchando tu voz… habla ahora'
                  : 'Buscar por zona, ciudad o dictar por voz…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_searchCtrl.text.isNotEmpty)
                    IconButton(
                      onPressed: () => setState(() => _searchCtrl.clear()),
                      icon: const Icon(Icons.clear, size: 18),
                    ),
                  IconButton(
                    onPressed: _toggleVoiceSearch,
                    tooltip: 'Dictar búsqueda por micrófono',
                    icon: Icon(
                      _isListening ? Icons.mic_rounded : Icons.mic_none_rounded,
                      color: _isListening
                          ? const Color(0xFFBE123C)
                          : const Color(0xFF2563EB),
                    ),
                  ),
                ],
              ),
              filled: true,
              fillColor: Colors.white,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: _isListening
                      ? const Color(0xFFBE123C)
                      : const Color(0xFFCBD5E1),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Filtros rápidos
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip('DISPONIBLES', 'Disponibles'),
                const SizedBox(width: 8),
                _buildFilterChip('TODOS', 'Todos'),
                const SizedBox(width: 8),
                _buildFilterChip('DEPARTAMENTO', 'Departamentos'),
                const SizedBox(width: 8),
                _buildFilterChip('CASA', 'Casas'),
                const SizedBox(width: 8),
                _buildFilterChip('FAVORITOS', '♥ Favoritos'),
              ],
            ),
          ),

          if (_nearbyResults != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFA7F3D0)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.gps_fixed,
                      size: 16, color: Color(0xFF047857)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Mostrando ${_nearbyResults!.length} inmueble(s) cercanos por GPS',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Color(0xFF047857),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _nearbyResults = null),
                    child: const Text('Ver todos'),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),

          if (widget.loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 60),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Column(
                children: [
                  Icon(Icons.search_off_rounded,
                      size: 44, color: Color(0xFF94A3B8)),
                  SizedBox(height: 10),
                  Text(
                    'No se encontraron inmuebles con ese filtro.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                ],
              ),
            )
          else
            ...filtered.map(
              (p) => _PropertyMobileCard(
                property: p,
                moneyFmt: _moneyFmt,
                isFavorite: ApiService.instance.isFavorite(p.code),
                onToggleFavorite: () async {
                  await ApiService.instance.toggleFavorite(p);
                  setState(() {});
                },
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PropertyDetailScreen(
                        property: p,
                        onChanged: widget.onRefresh,
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String id, String label) {
    final active = _selectedFilter == id;
    return ChoiceChip(
      label: Text(label),
      selected: active,
      onSelected: (_) => setState(() => _selectedFilter = id),
      selectedColor: const Color(0xFF2563EB),
      labelStyle: TextStyle(
        color: active ? Colors.white : const Color(0xFF0F172A),
        fontWeight: FontWeight.w600,
        fontSize: 12.5,
      ),
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(
          color: active ? const Color(0xFF2563EB) : const Color(0xFFE2E8F0),
        ),
      ),
    );
  }
}

class _PropertyMobileCard extends StatelessWidget {
  final PropertyItem property;
  final NumberFormat moneyFmt;
  final bool isFavorite;
  final VoidCallback onToggleFavorite;
  final VoidCallback onTap;

  const _PropertyMobileCard({
    required this.property,
    required this.moneyFmt,
    required this.isFavorite,
    required this.onToggleFavorite,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withOpacity(0.05),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Imagen desde Amazon S3
            SizedBox(
              height: 195,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    property.gallery.first,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: const Color(0xFFF1F5F9),
                      child: const Icon(Icons.apartment,
                          size: 48, color: Color(0xFF94A3B8)),
                    ),
                  ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: property.isAvailable
                            ? const Color(0xFFECFDF5)
                            : const Color(0xFFFFFBEB),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: property.isAvailable
                              ? const Color(0xFFA7F3D0)
                              : const Color(0xFFFDE68A),
                        ),
                      ),
                      child: Text(
                        property.isAvailable ? 'Disponible' : property.status,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: property.isAvailable
                              ? const Color(0xFF047857)
                              : const Color(0xFFB45309),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: IconButton.filledTonal(
                      onPressed: onToggleFavorite,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white.withOpacity(0.9),
                      ),
                      icon: Icon(
                        isFavorite
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: isFavorite
                            ? const Color(0xFFBE123C)
                            : const Color(0xFF0F172A),
                        size: 20,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.15),
                            blurRadius: 8,
                          ),
                        ],
                      ),
                      child: Text(
                        '${moneyFmt.format(property.price)} USD',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15.5,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          property.code,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ),
                      Text(
                        property.propertyType,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    property.title,
                    style: const TextStyle(
                      fontSize: 16.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined,
                          size: 15, color: Color(0xFF64748B)),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          '${property.zone}, ${property.city}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ),
                      if (property.distanceMeters != null)
                        Text(
                          'a ${(property.distanceMeters! / 1000).toStringAsFixed(1)} km',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF047857),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${property.area.toStringAsFixed(0)} m²',
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        Text('${property.bedrooms} dorm.',
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        Text('${property.bathrooms} baños',
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          'Arras ${moneyFmt.format(property.deposit)}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF2563EB),
                            fontSize: 12.5,
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
    );
  }
}

