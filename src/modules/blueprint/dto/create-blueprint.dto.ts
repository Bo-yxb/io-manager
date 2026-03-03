import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateBlueprintDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  requirement!: string;
}
