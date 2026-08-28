import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage, ContactMessageStatus } from '../../entities';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class ContactMessagesService {
  private readonly logger = new Logger('ContactMessages');

  constructor(
    @InjectRepository(ContactMessage)
    private readonly messagesRepo: Repository<ContactMessage>,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactMessageDto) {
    const message = this.messagesRepo.create({ ...dto, status: ContactMessageStatus.UNREAD });
    const saved = await this.messagesRepo.save(message);
    this.logger.log(`New contact message from ${saved.fullName} <${saved.email}> — id=${saved.id}`);

    try {
      await this.emailService.sendContactMessageNotification(saved);
    } catch (err) {
      this.logger.warn(
        `Contact-message notification threw unexpectedly for message #${saved.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return saved;
  }

  findAll(status?: ContactMessageStatus) {
    return this.messagesRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async getStats() {
    const total = await this.messagesRepo.count();
    const unread = await this.messagesRepo.count({ where: { status: ContactMessageStatus.UNREAD } });
    return { total, unread };
  }

  private async getOrThrow(id: number) {
    const message = await this.messagesRepo.findOne({ where: { id } });
    if (!message) throw new NotFoundException(`Contact message #${id} not found`);
    return message;
  }

  // Opening a message marks it read — matches "when the admin opens a
  // message it must be read" with no separate manual action required.
  async findOne(id: number) {
    const message = await this.getOrThrow(id);
    if (message.status === ContactMessageStatus.UNREAD) {
      message.status = ContactMessageStatus.READ;
      await this.messagesRepo.save(message);
      this.logger.log(`Contact message #${id} marked READ (opened)`);
    }
    return message;
  }

  async updateStatus(id: number, status: ContactMessageStatus) {
    const message = await this.getOrThrow(id);
    const previous = message.status;
    message.status = status;
    const saved = await this.messagesRepo.save(message);
    this.logger.log(`Contact message #${id} status changed: ${previous} -> ${status}`);
    return saved;
  }

  async setReplied(id: number, replied: boolean) {
    const message = await this.getOrThrow(id);
    message.repliedAt = replied ? new Date() : null;
    const saved = await this.messagesRepo.save(message);
    this.logger.log(`Contact message #${id} marked ${replied ? 'replied' : 'not replied'}`);
    return saved;
  }

  async remove(id: number) {
    const message = await this.getOrThrow(id);
    await this.messagesRepo.remove(message);
    this.logger.log(`Contact message #${id} deleted`);
    return { success: true };
  }
}
