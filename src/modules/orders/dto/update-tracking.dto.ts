import { IsEnum, IsString, MinLength } from 'class-validator';

export enum CarrierCode {
  USPS = 'usps',
  UPS = 'ups',
  FEDEX = 'fedex',
  DHL_EXPRESS = 'dhl_express',
  OTHER = 'other',
}

export class UpdateTrackingDto {
  @IsString()
  @MinLength(1)
  trackingNumber: string;

  @IsEnum(CarrierCode)
  carrierCode: CarrierCode;
}
