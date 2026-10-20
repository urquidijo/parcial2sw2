import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertiesModule } from './properties/properties.module';

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://josue:223044571@pruebasw.njh4zwk.mongodb.net/properties_catalog_db?retryWrites=true&w=majority';

@Module({
  imports: [
    MongooseModule.forRoot(mongoUri),
    PropertiesModule,
  ],
})
export class AppModule {}
