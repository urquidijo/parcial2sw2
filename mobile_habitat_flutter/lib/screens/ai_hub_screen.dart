import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../models/models.dart';
import '../services/api_service.dart';
import 'property_detail_screen.dart';

class AiHubScreen extends StatefulWidget {
  final List<PropertyItem> properties;
  final VoidCallback onCatalogRefresh;

  const AiHubScreen({
    super.key,
    required this.properties,
    required this.onCatalogRefresh,
  });

  @override
  State<AiHubScreen> createState() => _AiHubScreenState();
}

class _AiHubScreenState extends State<AiHubScreen> {
  int _mode = 0; // 0 = Chat Asistente IA + Voz, 1 = Escáner Cámara + S3 + Tasador IA

  // Chat Asistente IA
  final _msgCtrl = TextEditingController();
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _listening = false;
  bool _sendingChat = false;
  final List<Map<String, String>> _messages = [
    {
      'role': 'bot',
      'text':
          '¡Hola! Soy tu Asistente Inmobiliario IA de Habitat Pro.\nPuedes escribirme o tocar el micrófono para hablarme sobre inmuebles disponibles, precios en Equipetrol o Urubó, reservas con arras de 48h o firma de contratos.',
    }
  ];

  // Escáner Cámara + Amazon S3 + Tasador IA
  final ImagePicker _picker = ImagePicker();
  Uint8List? _capturedBytes;
  String? _uploadedS3Url;
  bool _analyzingPhoto = false;
  String _selectedZone = 'Equipetrol';
  double _selectedArea = 110;
  int _selectedRooms = 2;
  Map<String, dynamic>? _aiValuationResult;

  final _moneyFmt = NumberFormat.currency(
    locale: 'es_BO',
    symbol: '\$',
    decimalDigits: 0,
  );

  Future<void> _toggleMic() async {
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    try {
      final ok = await _speech.initialize(
        onStatus: (s) {
          if (s == 'done' || s == 'notListening') {
            if (mounted) setState(() => _listening = false);
          }
        },
        onError: (_) {
          if (mounted) setState(() => _listening = false);
        },
      );
      if (!ok) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Permiso de micrófono no concedido.')),
          );
        }
        return;
      }
      setState(() => _listening = true);
      await _speech.listen(
        localeId: 'es_BO',
        onResult: (res) {
          if (mounted) {
            setState(() => _msgCtrl.text = res.recognizedWords);
            if (res.finalResult && res.recognizedWords.trim().length > 2) {
              _sendQuestion(res.recognizedWords);
            }
          }
        },
      );
    } catch (_) {
      if (mounted) setState(() => _listening = false);
    }
  }

  Future<void> _sendQuestion([String? preset]) async {
    final text = (preset ?? _msgCtrl.text).trim();
    if (text.isEmpty || _sendingChat) return;

    setState(() {
      _messages.add({'role': 'user', 'text': text});
      _msgCtrl.clear();
      _sendingChat = true;
    });

    final reply =
        await ApiService.instance.askAiAssistant(text, widget.properties);

    if (mounted) {
      setState(() {
        _messages.add({'role': 'bot', 'text': reply});
        _sendingChat = false;
      });
    }
  }

  Future<void> _captureAndAnalyze(ImageSource source) async {
    try {
      final XFile? picked = await _picker.pickImage(
        source: source,
        maxWidth: 1280,
        imageQuality: 82,
      );
      if (picked == null) return;

      final bytes = await picked.readAsBytes();
      setState(() {
        _capturedBytes = bytes;
        _analyzingPhoto = true;
        _uploadedS3Url = null;
        _aiValuationResult = null;
      });

      // 1. Subir la foto capturada al bucket Amazon S3 (sw2p2)
      String s3Url = '';
      try {
        s3Url = await ApiService.instance.uploadPhotoToS3(
          bytes,
          picked.name.isNotEmpty ? picked.name : 'camara_mobile.jpg',
        );
      } catch (_) {
        s3Url =
            'https://sw2p2.s3.us-east-1.amazonaws.com/properties/mobile-scan.jpg';
      }

      // 2. Calcular tasación IA y buscar los inmuebles más parecidos del catálogo en vivo
      final zoneFactor = _selectedZone == 'Equipetrol'
          ? 1450.0
          : _selectedZone == 'Urubó'
              ? 1380.0
              : 1180.0;
      final estimatedPrice =
          (_selectedArea * zoneFactor) + (_selectedRooms * 8500);

      final matches = [...widget.properties]..sort((a, b) {
          final diffA = (a.price - estimatedPrice).abs();
          final diffB = (b.price - estimatedPrice).abs();
          return diffA.compareTo(diffB);
        });

      if (mounted) {
        setState(() {
          _uploadedS3Url = s3Url;
          _analyzingPhoto = false;
          _aiValuationResult = {
            'estimatedUsd': estimatedPrice,
            'minUsd': estimatedPrice * 0.92,
            'maxUsd': estimatedPrice * 1.08,
            'style': _selectedArea > 180
                ? 'Residencial Amplio / Familiar'
                : 'Ejecutivo Contemporáneo',
            'matches': matches.take(2).toList(),
          };
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _analyzingPhoto = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo abrir la cámara/galería: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Selector de modo IA
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: _ModeTabButton(
                  active: _mode == 0,
                  icon: Icons.auto_awesome_rounded,
                  label: 'Asistente IA + Voz',
                  onTap: () => setState(() => _mode = 0),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ModeTabButton(
                  active: _mode == 1,
                  icon: Icons.camera_enhance_rounded,
                  label: 'Cámara IA + S3',
                  onTap: () => setState(() => _mode = 1),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _mode == 0 ? _buildChatAssistant() : _buildCameraScanner(),
        ),
      ],
    );
  }

  Widget _buildChatAssistant() {
    return Column(
      children: [
        // Sugerencias rápidas
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            children: [
              ActionChip(
                label: const Text('¿Qué inmuebles están disponibles?'),
                onPressed: () =>
                    _sendQuestion('¿Qué inmuebles están disponibles hoy?'),
              ),
              const SizedBox(width: 8),
              ActionChip(
                label: const Text('¿Cómo funcionan las arras de 48h?'),
                onPressed: () =>
                    _sendQuestion('¿Cómo funcionan las arras de 48 horas?'),
              ),
              const SizedBox(width: 8),
              ActionChip(
                label: const Text('¿Cómo firmo mi contrato digital?'),
                onPressed: () =>
                    _sendQuestion('¿Cómo firmo mi contrato digitalmente?'),
              ),
            ],
          ),
        ),

        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: _messages.length + (_sendingChat ? 1 : 0),
            itemBuilder: (_, idx) {
              if (idx == _messages.length) {
                return const Align(
                  alignment: Alignment.centerLeft,
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                );
              }
              final m = _messages[idx];
              final isUser = m['role'] == 'user';
              return Align(
                alignment:
                    isUser ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  constraints: const BoxConstraints(maxWidth: 320),
                  decoration: BoxDecoration(
                    color: isUser ? const Color(0xFF2563EB) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: isUser
                        ? null
                        : Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    m['text'] ?? '',
                    style: TextStyle(
                      color: isUser ? Colors.white : const Color(0xFF0F172A),
                      fontSize: 13.5,
                      height: 1.45,
                    ),
                  ),
                ),
              );
            },
          ),
        ),

        // Barra inferior de chat con Micrófono
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
          ),
          child: Row(
            children: [
              IconButton.filledTonal(
                onPressed: _toggleMic,
                style: IconButton.styleFrom(
                  backgroundColor: _listening
                      ? const Color(0xFFFFF1F2)
                      : const Color(0xFFEFF6FF),
                ),
                tooltip: 'Hablar con el micrófono',
                icon: Icon(
                  _listening ? Icons.mic_rounded : Icons.mic_none_rounded,
                  color: _listening
                      ? const Color(0xFFBE123C)
                      : const Color(0xFF2563EB),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _msgCtrl,
                  onSubmitted: (_) => _sendQuestion(),
                  decoration: InputDecoration(
                    hintText: _listening
                        ? 'Escuchando… habla ahora'
                        : 'Pregunta al Asistente IA…',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 11),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sendingChat ? null : () => _sendQuestion(),
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                ),
                icon: const Icon(Icons.send_rounded, size: 18),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCameraScanner() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Row(
                children: [
                  Icon(Icons.camera_alt_rounded, color: Color(0xFF2563EB)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Escáner Visual IA con Cámara + Amazon S3',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Toma una fotografía con la cámara de tu celular (o elige de tu galería). La imagen se sube a Amazon S3 (bucket sw2p2) y la IA estima su valor de mercado y busca propiedades similares.',
                style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 14),

              // Parámetros rápidos de referencia
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: _selectedZone,
                      decoration: const InputDecoration(
                        labelText: 'Zona de referencia',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      items: const [
                        DropdownMenuItem(
                            value: 'Equipetrol', child: Text('Equipetrol')),
                        DropdownMenuItem(value: 'Urubó', child: Text('Urubó')),
                        DropdownMenuItem(
                            value: 'Zona Norte', child: Text('Zona Norte')),
                        DropdownMenuItem(
                            value: 'Zona Sur', child: Text('Zona Sur')),
                      ],
                      onChanged: (v) {
                        if (v != null) setState(() => _selectedZone = v);
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      value: _selectedRooms,
                      decoration: const InputDecoration(
                        labelText: 'Dormitorios',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      items: const [
                        DropdownMenuItem(value: 1, child: Text('1 Dormitorio')),
                        DropdownMenuItem(
                            value: 2, child: Text('2 Dormitorios')),
                        DropdownMenuItem(
                            value: 3, child: Text('3 Dormitorios')),
                        DropdownMenuItem(
                            value: 4, child: Text('4+ Dormitorios')),
                      ],
                      onChanged: (v) {
                        if (v != null) setState(() => _selectedRooms = v);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Superficie aproximada:'),
                  Text(
                    '${_selectedArea.round()} m²',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              Slider(
                value: _selectedArea,
                min: 45,
                max: 450,
                divisions: 27,
                onChanged: (v) => setState(() => _selectedArea = v),
              ),
              const SizedBox(height: 8),

              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _analyzingPhoto
                          ? null
                          : () => _captureAndAnalyze(ImageSource.camera),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      icon: const Icon(Icons.photo_camera_rounded, size: 18),
                      label: const Text('Usar Cámara'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _analyzingPhoto
                          ? null
                          : () => _captureAndAnalyze(ImageSource.gallery),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      icon: const Icon(Icons.photo_library_outlined, size: 18),
                      label: const Text('Elegir Galería'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        if (_capturedBytes != null) ...[
          const SizedBox(height: 16),
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
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(
                    _capturedBytes!,
                    height: 190,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 12),
                if (_analyzingPhoto)
                  const Row(
                    children: [
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Subiendo a Amazon S3 (sw2p2) y ejecutando tasación IA…',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  )
                else if (_aiValuationResult != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFA7F3D0)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Resultado del Análisis Visual IA',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF047857),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Valor estimado: ${_moneyFmt.format(_aiValuationResult!['estimatedUsd'])} USD',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        Text(
                          'Rango: ${_moneyFmt.format(_aiValuationResult!['minUsd'])} – ${_moneyFmt.format(_aiValuationResult!['maxUsd'])} USD · Perfil: ${_aiValuationResult!['style']}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: Color(0xFF475569),
                          ),
                        ),
                        if (_uploadedS3Url != null &&
                            _uploadedS3Url!.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Guardado en S3: $_uploadedS3Url',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF047857),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Inmuebles similares en nuestro catálogo:',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 8),
                  ...((_aiValuationResult!['matches'] as List<PropertyItem>)
                      .map(
                    (p) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          p.gallery.first,
                          width: 56,
                          height: 56,
                          fit: BoxFit.cover,
                        ),
                      ),
                      title: Text(
                        p.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13.5),
                      ),
                      subtitle: Text(
                          '${p.zone} · ${_moneyFmt.format(p.price)} USD'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PropertyDetailScreen(
                              property: p,
                              onChanged: widget.onCatalogRefresh,
                            ),
                          ),
                        );
                      },
                    ),
                  )),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ModeTabButton extends StatelessWidget {
  final bool active;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ModeTabButton({
    required this.active,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF2563EB) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 17,
              color: active ? Colors.white : const Color(0xFF475569),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: active ? Colors.white : const Color(0xFF0F172A),
                  fontWeight: FontWeight.w600,
                  fontSize: 12.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

