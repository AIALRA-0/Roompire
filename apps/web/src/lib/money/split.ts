import Decimal from "decimal.js";

export type EqualSplitInput = {
  amount: string;
  participants: number;
  scale?: number;
};

export type EqualSplitResult = {
  shares: string[];
  total: string;
};

export function splitEqual({ amount, participants, scale = 2 }: EqualSplitInput): EqualSplitResult {
  if (!Number.isInteger(participants) || participants <= 0) {
    throw new Error("participants must be a positive integer");
  }

  if (!Number.isInteger(scale) || scale < 0 || scale > 6) {
    throw new Error("scale must be an integer between 0 and 6");
  }

  const decimalAmount = new Decimal(amount);

  if (!decimalAmount.isFinite() || decimalAmount.isNegative()) {
    throw new Error("amount must be a non-negative decimal string");
  }

  const unit = new Decimal(10).pow(-scale);
  const baseShare = decimalAmount.div(participants).toDecimalPlaces(scale, Decimal.ROUND_DOWN);
  const baseTotal = baseShare.mul(participants);
  const remainderUnits = decimalAmount.minus(baseTotal).div(unit).toNumber();

  const shares = Array.from({ length: participants }, (_, index) =>
    baseShare.plus(index < remainderUnits ? unit : 0).toFixed(scale),
  );

  const total = shares.reduce((sum, share) => sum.plus(share), new Decimal(0)).toFixed(scale);

  return { shares, total };
}
