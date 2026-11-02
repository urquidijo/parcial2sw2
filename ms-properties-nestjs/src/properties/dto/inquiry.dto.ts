import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInquiryDto {
  @IsString()
  @MinLength(5, { message: 'La consulta debe tener al menos 5 caracteres' })
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class AnswerInquiryDto {
  @IsString()
  @MinLength(2, { message: 'La respuesta no puede estar vacía' })
  @MaxLength(1000)
  answer: string;
}
