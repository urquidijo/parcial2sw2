import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Property, PropertySchema } from './schemas/property.schema';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Property.name, schema: PropertySchema }]),
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
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
