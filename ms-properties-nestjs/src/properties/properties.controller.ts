import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, ReserveLockDto, GeoSearchDto } from './dto/property.dto';
import { PropertyStatus, PropertyType } from './schemas/property.schema';

@Controller('api/v1/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPropertyDto: CreatePropertyDto) {
    return this.propertiesService.create(createPropertyDto);
  }

  @Get()
  findAll(
    @Query('status') status?: PropertyStatus,
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: PropertyType,
  ) {
    return this.propertiesService.findAll(status, city, propertyType);
  }

  @Get('search/geo')
  searchGeo(
    @Query('lng') lng: string,
    @Query('lat') lat: string,
    @Query('distance') distance?: string,
  ) {
    const geoDto: GeoSearchDto = {
      longitude: parseFloat(lng),
      latitude: parseFloat(lat),
      maxDistanceMeters: distance ? parseFloat(distance) : 5000,
    };
    return this.propertiesService.searchGeospatial(geoDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.propertiesService.findByCode(code);
  }

  // --- PASOS DEL PATRÓN SAGA TRANSACCIONAL ---

  /**
   * SAGA PASO 1: Bloqueo preventivo de la propiedad.
   */
  @Post(':id/reserve-lock')
  @HttpCode(HttpStatus.OK)
  reserveLock(@Param('id') id: string, @Body() lockDto: ReserveLockDto) {
    return this.propertiesService.reserveLock(id, lockDto);
  }

  /**
   * SAGA COMPENSACIÓN: Desbloqueo y rollback a DISPONIBLE si falla el cobro o pre-contrato.
   */
  @Post(':id/release-lock')
  @HttpCode(HttpStatus.OK)
  releaseLock(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.propertiesService.releaseLock(id, reason);
  }

  /**
   * SAGA CONFIRMACIÓN: Confirmación final tras éxito de toda la transacción distribuida.
   */
  @Post(':id/confirm-reserved')
  @HttpCode(HttpStatus.OK)
  confirmReserved(@Param('id') id: string) {
    return this.propertiesService.confirmReserved(id);
  }
}
