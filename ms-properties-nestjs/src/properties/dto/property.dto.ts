import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PropertyType } from '../schemas/property.schema';

export class CreatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @MinLength(5, { message: 'El título debe tener al menos 5 caracteres' })
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(PropertyType, { message: 'Tipo de inmueble inválido' })
  propertyType: PropertyType;

  @IsOptional()
  @IsString()
  deliveryType?: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @IsPositive({ message: 'El precio debe ser mayor a 0' })
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maintenanceFee?: number;

  @IsNumber({}, { message: 'La superficie debe ser un número' })
  @IsPositive({ message: 'La superficie debe ser mayor a 0' })
  areaSquareMeters: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  parkingSlots?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsString()
  @IsNotEmpty({ message: 'La ciudad es obligatoria' })
  city: string;

  @IsString()
  @IsNotEmpty({ message: 'La zona es obligatoria' })
  zone: string;

  @IsOptional()
  @IsLatitude({ message: 'Latitud inválida' })
  latitude?: number;

  @IsOptional()
  @IsLongitude({ message: 'Longitud inválida' })
  longitude?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: 'Cada foto debe ser una URL válida' })
  @ArrayMaxSize(20)
  photos?: string[];

  @IsOptional()
  @IsUrl({}, { message: 'El recorrido 3D debe ser una URL válida' })
  virtualTour3dUrl?: string;

  @IsOptional()
  @IsString()
  folioReal?: string;

  @IsOptional()
  @IsObject()
  dynamicAttributes?: Record<string, any>;
}

// El código identifica al inmueble en reservas y contratos, así que no se edita.
export class UpdatePropertyDto extends PartialType(OmitType(CreatePropertyDto, ['code'] as const)) {
  latitude?: number;
  longitude?: number;
  photos?: string[];
  price?: number;
  deposit?: number;
  currency?: string;
}

export class ReserveLockDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsNumber()
  @IsOptional()
  lockDurationMinutes?: number = 60; // 1 hora por defecto para completar Saga
}

export class GeoSearchDto {
  @IsLongitude()
  longitude: number;

  @IsLatitude()
  latitude: number;

  @IsNumber()
  @IsOptional()
  maxDistanceMeters?: number = 5000; // Radio en metros
}
