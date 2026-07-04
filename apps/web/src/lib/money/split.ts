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

export type WeightedSplitInput = {
  amount: string;
  weights: string[];
  scale?: number;
};

export type WeightedSplitResult = EqualSplitResult;

function assertScale(scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) {
    throw new Error("scale must be an integer between 0 and 6");
  }
}

export function splitEqual({ amount, participants, scale = 2 }: EqualSplitInput): EqualSplitResult {
  if (!Number.isInteger(participants) || participants <= 0) {
    throw new Error("participants must be a positive integer");
  }

  assertScale(scale);

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

export function splitByWeights({
  amount,
  weights,
  scale = 2,
}: WeightedSplitInput): WeightedSplitResult {
  if (weights.length === 0) {
    throw new Error("weights must not be empty");
  }

  assertScale(scale);

  const decimalAmount = new Decimal(amount);

  if (!decimalAmount.isFinite() || decimalAmount.isNegative()) {
    throw new Error("amount must be a non-negative decimal string");
  }

  const decimalWeights = weights.map((weight) => new Decimal(weight));

  if (decimalWeights.some((weight) => !weight.isFinite() || weight.isNegative())) {
    throw new Error("weights must be non-negative decimal strings");
  }

  const totalWeight = decimalWeights.reduce((sum, weight) => sum.plus(weight), new Decimal(0));

  if (totalWeight.lte(0)) {
    throw new Error("at least one weight must be greater than zero");
  }

  const unit = new Decimal(10).pow(-scale);
  const exactShares = decimalWeights.map((weight) => decimalAmount.mul(weight).div(totalWeight));
  const baseShares = exactShares.map((share) => share.toDecimalPlaces(scale, Decimal.ROUND_DOWN));
  const baseTotal = baseShares.reduce((sum, share) => sum.plus(share), new Decimal(0));
  const remainderUnits = decimalAmount.minus(baseTotal).div(unit).toNumber();
  const remainderOrder = exactShares
    .map((share, index) => ({
      fraction: share.minus(baseShares[index]!),
      index,
    }))
    .sort((left, right) => {
      const fractionComparison = right.fraction.comparedTo(left.fraction);

      return fractionComparison === 0 ? left.index - right.index : fractionComparison;
    });
  const shares = baseShares.map((share) => share);

  for (let index = 0; index < remainderUnits; index += 1) {
    const target = remainderOrder[index % remainderOrder.length]!.index;

    shares[target] = shares[target]!.plus(unit);
  }

  const formattedShares = shares.map((share) => share.toFixed(scale));
  const total = formattedShares
    .reduce((sum, share) => sum.plus(share), new Decimal(0))
    .toFixed(scale);

  return { shares: formattedShares, total };
}
