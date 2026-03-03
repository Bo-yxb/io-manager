import { IsString, IsIn } from 'class-validator';

export class UpdateWorkerStatusDto {
  @IsString()
  @IsIn(['idle', 'busy'])
  status!: string;
}
