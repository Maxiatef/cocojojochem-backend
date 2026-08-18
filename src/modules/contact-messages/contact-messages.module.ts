import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactMessage } from '../../entities';
import { ContactMessagesService } from './contact-messages.service';
import { ContactMessagesController } from './contact-messages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactMessage])],
  controllers: [ContactMessagesController],
  providers: [ContactMessagesService],
  exports: [ContactMessagesService],
})
export class ContactMessagesModule {}
