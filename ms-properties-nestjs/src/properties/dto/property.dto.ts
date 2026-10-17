import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType, PropertyStatus } from '../schemas/property.schema';

export class LocationDto {
  @IsString()
  @IsNotEmpty()
  type: string = 'Point';

  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: number[]; // [lng, lat]
}

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PropertyType)
  propertyType: PropertyType;

  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  @IsNumber()
  price: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsNumber()
  areaSquareMeters: number;

  @IsNumber()
  @IsOptional()
  rooms?: number = 0;

  @IsNumber()
  @IsOptional()
  bathrooms?: number = 0;

  @IsNumber()
  @IsOptional()
  parkingSlots?: number = 0;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsOptional()
  zone?: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsArray()
  @IsOptional()
  amenities?: string[];

  @IsArray()
  @IsOptional()
  photos?: string[];

  @IsString()
  @IsOptional()
  virtualTour3dUrl?: string;

  @IsOptional()
  dynamicAttributes?: Record<string, any>;
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
  @IsNumber()
  longitude: number;

  @IsNumber()
  latitude: number;

  @IsNumber()
  @IsOptional()
  maxDistanceMeters?: number = 5000; // Radio en metros
}
