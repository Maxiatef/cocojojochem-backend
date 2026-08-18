import { PartialType } from '@nestjs/mapped-types';
import { CreateBulkSaleDto } from './create-bulk-sale.dto';

export class UpdateBulkSaleDto extends PartialType(CreateBulkSaleDto) {}
