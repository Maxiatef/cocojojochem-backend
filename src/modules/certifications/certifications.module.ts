import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certification, Product } from '../../entities';
import { CertificationsService } from './certifications.service';
import { CertificationsController } from './certifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Certification, Product])],
  controllers: [CertificationsController],
  providers: [CertificationsService],
  exports: [CertificationsService],
})
export class CertificationsModule {}
