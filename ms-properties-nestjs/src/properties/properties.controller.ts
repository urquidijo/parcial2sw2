import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto, ReserveLockDto, GeoSearchDto } from './dto/property.dto';
import { AuthUser, CurrentUser, Roles } from '../auth/auth-user';

@Controller('api/v1/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles('AGENTE', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePropertyDto, @CurrentUser() user: AuthUser) {
    return this.propertiesService.create(dto, user);
  }

  @Patch(':id')
  @Roles('AGENTE', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(id, dto);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
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
    const { longitude, latitude, maxDistanceMeters } = geoDto;
    const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    if (!valid || !(maxDistanceMeters > 0)) {
      throw new BadRequestException('Parámetros inválidos: se requieren lat (-90..90), lng (-180..180) y distance > 0');
    }
    return this.propertiesService.searchGeospatial(geoDto);
  }

  @Post('reset-all')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  resetAll() {
    return this.propertiesService.resetAllProperties();
  }

  @Post(':id/reset')
  @Roles('ADMIN', 'AGENTE')
  @HttpCode(HttpStatus.OK)
  resetOne(@Param('id') id: string) {
    return this.propertiesService.resetProperty(id);
  }

  // Cierre de la operación (CU16): lo cambia el Cajero al registrar el saldo o la primera cuota.
  @Patch(':id/status')
  @Roles('FINANZAS', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reservedBy') reservedBy?: string,
  ) {
    return this.propertiesService.updateStatus(id, status, reservedBy);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.propertiesService.findByCode(code);
  }

  // --- PASOS DEL PATRÓN SAGA DISTRIBUIDO ---

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
  confirmReserved(
    @Param('id') id: string,
    @Body('buyerName') buyerName?: string,
    @Body('buyerPhone') buyerPhone?: string,
  ) {
    return this.propertiesService.confirmReserved(id, buyerName, buyerPhone);
  }
}
