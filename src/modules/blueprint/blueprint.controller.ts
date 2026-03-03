import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { BlueprintService } from './blueprint.service';

@Controller('templates')
export class BlueprintController {
  constructor(private readonly blueprintService: BlueprintService) {}

  @Get()
  @Roles('boss', 'pm')
  findAll() {
    return this.blueprintService.findAllTemplates();
  }
}
