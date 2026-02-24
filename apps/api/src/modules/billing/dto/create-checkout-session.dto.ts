import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  planKey!: string;
}
