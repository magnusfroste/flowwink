import { DashCard, BigFigure, Subline, QuietEmpty, fmtSek } from './_shared';
import { useIncomeStatementYTD } from './ResultCard';

const CORPORATE_TAX_RATE = 0.206;

export function TaxPreviewCard() {
  const { data, isLoading, isError } = useIncomeStatementYTD();

  if (isLoading) {
    return (
      <DashCard label="Estimated corporate tax">
        <QuietEmpty>Loading…</QuietEmpty>
      </DashCard>
    );
  }

  if (isError || !data) {
    return (
      <DashCard label="Estimated corporate tax">
        <QuietEmpty>No data yet.</QuietEmpty>
      </DashCard>
    );
  }

  const result = data.net_result_cents;
  if (result <= 0) {
    return (
      <DashCard label="Estimated corporate tax">
        <BigFigure value={fmtSek(0)} />
        <Subline>No tax on current result · Preliminary — running estimate</Subline>
      </DashCard>
    );
  }

  const taxCents = Math.round(result * CORPORATE_TAX_RATE);
  return (
    <DashCard label="Estimated corporate tax (20.6%)">
      <BigFigure value={fmtSek(taxCents)} />
      <Subline>Preliminary — running estimate</Subline>
    </DashCard>
  );
}
