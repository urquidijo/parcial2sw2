import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Property, PropertySchema } from './schemas/property.schema';
import { Inquiry, InquirySchema } from './schemas/inquiry.schema';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { ArchitectureController } from './architecture.controller';
import { PROPERTY_REPOSITORY } from './domain/property.repository';
import { MongoPropertyRepository } from './infrastructure/mongo-property.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: Inquiry.name, schema: InquirySchema },
    ]),
  ],
  controllers: [PropertiesController, InquiriesController, ArchitectureController],
  providers: [
    PropertiesService,
    InquiriesService,
    // DDD: la aplicación depende de la interfaz del repositorio; aquí se elige la implementación (MongoDB).
    { provide: PROPERTY_REPOSITORY, useClass: MongoPropertyRepository },
  ],
  exports: [PropertiesService],
})
export class PropertiesModule implements OnModuleInit {
  constructor(private readonly propertiesService: PropertiesService) {}

  async onModuleInit() {
    // Si la BD está vacía, sembramos datos de demostración
    try {
      await this.propertiesService.seedInitialData();
    } catch (err) {
      console.warn('Advertencia al sembrar datos iniciales:', err.message);
    }
  }
}
