import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageView } from '../../entities';
import { TrackPageViewDto } from './dto/track-page-view.dto';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(PageView)
    private readonly pageViewsRepo: Repository<PageView>,
  ) {}

  record(dto: TrackPageViewDto) {
    const pageView = this.pageViewsRepo.create({ path: dto.path, visitorId: dto.visitorId });
    return this.pageViewsRepo.save(pageView);
  }
}
