import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterSubscriber } from '../../entities';

@Injectable()
export class NewsletterService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscribersRepo: Repository<NewsletterSubscriber>,
  ) {}

  async subscribe(email: string) {
    const existing = await this.subscribersRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already subscribed');
    const subscriber = this.subscribersRepo.create({ email });
    return this.subscribersRepo.save(subscriber);
  }
}
