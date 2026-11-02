import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../auth/auth-user';
import { AnswerInquiryDto, CreateInquiryDto } from './dto/inquiry.dto';
import { PropertiesService } from './properties.service';
import { Inquiry, InquiryDocument, InquiryStatus } from './schemas/inquiry.schema';

@Injectable()
export class InquiriesService {
  constructor(
    @InjectModel(Inquiry.name) private readonly inquiryModel: Model<InquiryDocument>,
    private readonly propertiesService: PropertiesService,
  ) {}

  async create(propertyId: string, dto: CreateInquiryDto, user: AuthUser) {
    const property = await this.propertiesService.findOne(propertyId);
    const inquiry = await new this.inquiryModel({
      propertyId: property.code,
      propertyTitle: property.title,
      clientId: user.id,
      clientName: user.name,
      clientEmail: user.email,
      clientPhone: dto.phone,
      message: dto.message.trim(),
    }).save();
    return this.format(inquiry);
  }

  // El cliente ve solo sus consultas; agentes, atención y admin ven todas.
  async list(user: AuthUser) {
    const filter = user.role === 'CLIENTE' ? { clientId: user.id } : {};
    const docs = await this.inquiryModel.find(filter).sort({ status: 1, createdAt: -1 }).limit(200).exec();
    return docs.map((d) => this.format(d));
  }

  async answer(id: string, dto: AnswerInquiryDto, user: AuthUser) {
    const inquiry = id.match(/^[0-9a-fA-F]{24}$/) ? await this.inquiryModel.findById(id).exec() : null;
    if (!inquiry) {
      throw new NotFoundException(`Consulta ${id} no encontrada`);
    }
    if (inquiry.status === InquiryStatus.RESPONDIDA) {
      throw new ConflictException('Esta consulta ya fue respondida');
    }
    inquiry.set({
      status: InquiryStatus.RESPONDIDA,
      answer: dto.answer.trim(),
      answeredBy: user.name,
      answeredAt: new Date(),
    });
    await inquiry.save();
    return this.format(inquiry);
  }

  private format(doc: InquiryDocument) {
    const obj: any = doc.toObject();
    return {
      id: obj._id.toString(),
      propertyId: obj.propertyId,
      propertyTitle: obj.propertyTitle,
      clientName: obj.clientName,
      clientEmail: obj.clientEmail,
      clientPhone: obj.clientPhone,
      message: obj.message,
      status: obj.status,
      answer: obj.answer,
      answeredBy: obj.answeredBy,
      answeredAt: obj.answeredAt,
      createdAt: obj.createdAt,
    };
  }
}
