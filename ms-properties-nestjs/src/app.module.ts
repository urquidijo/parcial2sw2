import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertiesModule } from './properties/properties.module';

const mongoUri = process.env.MONGO_URI || 'mongodb://proptech_admin:admin_secure_password@localhost:27017/properties_catalog_db?authSource=admin';

@Module({
  imports: [
    MongooseModule.forRoot(mongoUri),
    PropertiesModule,
  ],
})
export class AppModule {}
