import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class WorkerReportDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsOptional()
  artifacts?: any;
}
