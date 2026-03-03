import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, IsArray } from 'class-validator';

export class CreateBlueprintNodeDto {
  @IsString()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsIn(['milestone', 'module', 'task'])
  level!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  taskType?: string;

  @IsString()
  @IsOptional()
  assignee?: string;

  @IsNumber()
  @IsOptional()
  timeoutMin?: number;

  @IsArray()
  @IsOptional()
  dependsOn?: string[];

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
