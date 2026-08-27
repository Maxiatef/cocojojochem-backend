import { Module } from '@nestjs/common';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { EmailService } from './email.service';

@Module({
  imports: [SiteSettingsModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
