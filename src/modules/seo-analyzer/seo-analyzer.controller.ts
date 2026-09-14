import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SeoAnalyzerService } from './seo-analyzer.service';
import { AnalyzeProductSeoDto } from './dto/analyze-product-seo.dto';

@ApiTags('SEO Analyzer')
@Controller('seo-analyzer')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SeoAnalyzerController {
  constructor(private readonly seoAnalyzerService: SeoAnalyzerService) {}

  @Post('analyze')
  @RequirePermission('canRunSeoAnalyzer')
  analyze() {
    return this.seoAnalyzerService.analyzeAll();
  }

  /**
   * Scores a single product from a draft payload — no database write, so the
   * editor can call it while the admin types and before anything is saved.
   */
  @Post('product')
  @RequirePermission('canRunSeoAnalyzer')
  analyzeProduct(@Body() body: AnalyzeProductSeoDto) {
    return this.seoAnalyzerService.analyzeProduct(body);
  }

  @Get('overview')
  overview() {
    return this.seoAnalyzerService.getOverview();
  }

  @Get('issues')
  issues(@Query('isFixed') isFixed?: string) {
    const parsed = isFixed === undefined ? undefined : isFixed === 'true';
    return this.seoAnalyzerService.getIssues(parsed);
  }

  @Get('metrics')
  metrics() {
    return this.seoAnalyzerService.getMetrics();
  }
}
