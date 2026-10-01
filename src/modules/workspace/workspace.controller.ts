import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceService } from './workspace.service';
import { MergeWorkspaceDto, SaveCompareDto, SaveProjectsDto } from './dto/workspace.dto';

// The storefront's comparison list and formulation projects for a signed-in
// customer. Own-account only, like the wishlist. The client always sends the
// whole list, so there are no per-item routes.
@ApiTags('Workspace')
@ApiBearerAuth('access-token')
@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  get(@Req() req: any) {
    return this.workspaceService.get(req.user.id);
  }

  @Put('compare')
  saveCompare(@Req() req: any, @Body() dto: SaveCompareDto) {
    return this.workspaceService.saveCompare(req.user.id, dto.items);
  }

  @Put('projects')
  saveProjects(@Req() req: any, @Body() dto: SaveProjectsDto) {
    return this.workspaceService.saveProjects(req.user.id, dto.projects);
  }

  @Post('merge')
  merge(@Req() req: any, @Body() dto: MergeWorkspaceDto) {
    return this.workspaceService.merge(req.user.id, dto.compare, dto.projects);
  }
}
