import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { KeycloakAuthGuard } from './auth/keycloak-auth.guard';
import { PropertiesModule } from './properties/properties.module';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error('Falta la variable MONGO_URI (configurarla en ms-properties-nestjs/.env)');
}

@Module({
  imports: [
    MongooseModule.forRoot(mongoUri),
    PropertiesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: KeycloakAuthGuard }],
})
export class AppModule {}
