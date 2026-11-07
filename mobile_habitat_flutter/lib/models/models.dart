class UserProfile {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String originalRole;

  const UserProfile({
    required this.id,
    required this.name,
    required this.email,
    this.phone = '+591 70012345',
    this.originalRole = 'CLIENTE',
  });

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'CL';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json['id'] ?? json['sub'] ?? '').toString(),
      name: (json['name'] ?? json['preferred_username'] ?? 'Cliente Habitat')
          .toString(),
      email: (json['email'] ?? '').toString(),
      phone: (json['phone'] ?? '+591 70012345').toString(),
      originalRole: (json['role'] ?? 'CLIENTE').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'role': originalRole,
      };
}

class PropertyItem {
  final String id;
  final String code;
  final String title;
  final String description;
  final String propertyType;
  final String status;
  final double price;
  final double deposit;
  final double area;
  final int bedrooms;
  final int bathrooms;
  final int parking;
  final String city;
  final String zone;
  final String address;
  final String image;
  final List<String> photos;
  final List<String> amenities;
  final String deliveryStatus;
  final String brokerName;
  final String brokerPhone;
  final String brokerEmail;
  final String tour3dUrl;
  final double? latitude;
  final double? longitude;
  final double? distanceMeters;

  const PropertyItem({
    required this.id,
    required this.code,
    required this.title,
    required this.description,
    required this.propertyType,
    required this.status,
    required this.price,
    required this.deposit,
    required this.area,
    required this.bedrooms,
    required this.bathrooms,
    required this.parking,
    required this.city,
    required this.zone,
    required this.address,
    required this.image,
    required this.photos,
    required this.amenities,
    required this.deliveryStatus,
    required this.brokerName,
    required this.brokerPhone,
    required this.brokerEmail,
    required this.tour3dUrl,
    this.latitude,
    this.longitude,
    this.distanceMeters,
  });

  bool get isAvailable => status.toUpperCase() == 'DISPONIBLE';

  List<String> get gallery {
    final list = <String>[];
    for (final p in photos) {
      if (p.trim().isNotEmpty && !list.contains(p.trim())) {
        list.add(p.trim());
      }
    }
    if (image.trim().isNotEmpty && !list.contains(image.trim())) {
      list.insert(0, image.trim());
    }
    if (list.isEmpty) {
      list.add(
          'https://sw2p2.s3.us-east-1.amazonaws.com/properties/prop-default.jpg');
    }
    return list;
  }

  factory PropertyItem.fromJson(Map<String, dynamic> json) {
    final rawCode = (json['code'] ?? json['id'] ?? '').toString();
    final rawPrice = _toDouble(json['price']);
    final rawDeposit = _toDouble(json['deposit']);
    final rawPhotos = (json['photos'] is List)
        ? (json['photos'] as List).map((e) => e.toString()).toList()
        : <String>[];
    final rawAmenities = (json['amenities'] is List)
        ? (json['amenities'] as List).map((e) => e.toString()).toList()
        : <String>[];

    double? lat = _toNullableDouble(json['latitude']);
    double? lng = _toNullableDouble(json['longitude']);
    if ((lat == null || lng == null) &&
        json['location'] is Map &&
        json['location']['coordinates'] is List) {
      final coords = json['location']['coordinates'] as List;
      if (coords.length >= 2) {
        lng = _toNullableDouble(coords[0]);
        lat = _toNullableDouble(coords[1]);
      }
    }

    return PropertyItem(
      id: (json['id'] ?? rawCode).toString(),
      code: rawCode,
      title: (json['title'] ?? 'Inmueble Habitat Pro').toString(),
      description: (json['description'] ?? '').toString(),
      propertyType: (json['propertyType'] ?? 'DEPARTAMENTO').toString(),
      status: (json['status'] ?? 'DISPONIBLE').toString(),
      price: rawPrice,
      deposit: rawDeposit > 0
          ? rawDeposit
          : (rawPrice > 0 ? (rawPrice * 0.03).roundToDouble() : 5000),
      area: _toDouble(json['area']),
      bedrooms: _toInt(json['bedrooms']),
      bathrooms: _toInt(json['bathrooms']),
      parking: _toInt(json['parking']),
      city: (json['city'] ?? 'Santa Cruz').toString(),
      zone: (json['zone'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      image: (json['image'] ??
              (rawPhotos.isNotEmpty
                  ? rawPhotos.first
                  : 'https://sw2p2.s3.us-east-1.amazonaws.com/properties/prop-default.jpg'))
          .toString(),
      photos: rawPhotos,
      amenities: rawAmenities,
      deliveryStatus:
          (json['deliveryStatus'] ?? 'Entrega inmediata').toString(),
      brokerName: (json['brokerName'] ?? 'Carlos Broker').toString(),
      brokerPhone: (json['brokerPhone'] ?? '+591 70099111').toString(),
      brokerEmail:
          (json['brokerEmail'] ?? 'carlos.broker@habitat.pro').toString(),
      tour3dUrl: (json['tour3dUrl'] ?? '').toString(),
      latitude: lat,
      longitude: lng,
      distanceMeters: _toNullableDouble(json['distanceMeters']),
    );
  }
}

class ReservationItem {
  final String id;
  final String propertyId;
  final String propertyTitle;
  final double depositAmount;
  final String status;
  final String contractNumber;
  final String expiresAt;
  final String createdAt;

  const ReservationItem({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.depositAmount,
    required this.status,
    required this.contractNumber,
    required this.expiresAt,
    required this.createdAt,
  });

  bool get isActive => status.toUpperCase() == 'ACTIVA';

  factory ReservationItem.fromJson(Map<String, dynamic> json) {
    return ReservationItem(
      id: (json['reservationId'] ?? json['id'] ?? '').toString(),
      propertyId: (json['propertyId'] ?? json['property_id'] ?? '').toString(),
      propertyTitle: (json['propertyTitle'] ??
              json['property_title'] ??
              'Inmueble reservado')
          .toString(),
      depositAmount:
          _toDouble(json['depositAmount'] ?? json['deposit_amount'] ?? 0),
      status: (json['status'] ?? 'ACTIVA').toString(),
      contractNumber:
          (json['contractNumber'] ?? json['contract_number'] ?? '').toString(),
      expiresAt: (json['expires_at'] ?? json['expiresAt'] ?? '').toString(),
      createdAt: (json['created_at'] ?? json['createdAt'] ?? '').toString(),
    );
  }
}

class AppointmentItem {
  final String id;
  final String propertyId;
  final String propertyTitle;
  final String visitDate;
  final String visitTime;
  final String visitType;
  final String status;
  final String notes;

  const AppointmentItem({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.visitDate,
    required this.visitTime,
    required this.visitType,
    required this.status,
    required this.notes,
  });

  factory AppointmentItem.fromJson(Map<String, dynamic> json) {
    return AppointmentItem(
      id: (json['id'] ?? '').toString(),
      propertyId: (json['propertyId'] ?? '').toString(),
      propertyTitle:
          (json['propertyTitle'] ?? 'Inmueble seleccionado').toString(),
      visitDate: (json['visitDate'] ?? '').toString(),
      visitTime: (json['visitTime'] ?? '').toString(),
      visitType: (json['visitType'] ?? 'PRESENCIAL').toString(),
      status: (json['status'] ?? 'CONFIRMADA').toString(),
      notes: (json['notes'] ?? '').toString(),
    );
  }
}

class ContractItem {
  final String id;
  final String contractNumber;
  final String contractType;
  final String status;
  final String propertyId;
  final String propertyTitle;
  final double totalAmount;
  final double downPayment;
  final String legalClauses;
  final int signaturesCount;
  final int signaturesRequired;
  final bool signedByClient;

  const ContractItem({
    required this.id,
    required this.contractNumber,
    required this.contractType,
    required this.status,
    required this.propertyId,
    required this.propertyTitle,
    required this.totalAmount,
    required this.downPayment,
    required this.legalClauses,
    required this.signaturesCount,
    required this.signaturesRequired,
    required this.signedByClient,
  });

  bool get canClientSign =>
      status == 'PENDIENTE_FIRMA' && !signedByClient;

  factory ContractItem.fromJson(Map<String, dynamic> json) {
    final sigs = (json['signatures'] is List)
        ? (json['signatures'] as List)
        : const [];
    final hasClientSig = sigs.any((s) =>
        s is Map &&
        (s['signerRole'] ?? '').toString().toUpperCase() == 'CLIENTE');
    return ContractItem(
      id: (json['id'] ?? '').toString(),
      contractNumber: (json['contractNumber'] ?? '').toString(),
      contractType:
          (json['contractType'] ?? 'PROMESA_COMPRAVENTA').toString(),
      status: (json['status'] ?? 'BORRADOR').toString(),
      propertyId: (json['propertyId'] ?? '').toString(),
      propertyTitle: (json['propertyTitle'] ?? '').toString(),
      totalAmount: _toDouble(json['totalAmount']),
      downPayment: _toDouble(json['downPayment']),
      legalClauses: (json['legalClauses'] ?? '').toString(),
      signaturesCount: sigs.length,
      signaturesRequired: _toInt(json['signaturesRequired'], fallback: 2),
      signedByClient: hasClientSig,
    );
  }
}

class PushAlertItem {
  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final String category;

  const PushAlertItem({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    this.category = 'SISTEMA',
  });
}

double _toDouble(dynamic value) {
  if (value == null) return 0;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString()) ?? 0;
}

double? _toNullableDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int _toInt(dynamic value, {int fallback = 0}) {
  if (value == null) return fallback;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString()) ?? fallback;
}

