import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WikiMarkdown } from "@/components/admin/wiki/WikiMarkdown";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";
import { Briefcase, GraduationCap, Award, Globe, Link2, Linkedin, Pencil } from "lucide-react";

/**
 * The read view a consultant profile never had. The Profiles tab is a table
 * plus an edit form, so everything a CV carries beyond name/title/skills —
 * the markdown bio, the assignments in `experience_json`, `education`,
 * certifications — was stored (parse-resume and the check-in interview both
 * write it) and shown nowhere. "I thought we had more context, simulated as
 * parsed from their PDF" (Magnus, 2026-09-02): we did; the UI hid it.
 *
 * Shapes are tolerant on purpose. `experience_json` is what
 * consultant_checkin_update declares ({title, company, start_date, end_date,
 * description}); `education` has no declared shape yet, so common keys are
 * read and anything else is shown as its text. Nothing here is a second
 * writer — it renders the row as it is.
 */

export interface ExperienceEntry {
  title?: string;
  role?: string;
  company?: string;
  start_date?: string;
  end_date?: string;
  period?: string;
  description?: string;
}

export interface EducationEntry {
  institution?: string;
  school?: string;
  degree?: string;
  field?: string;
  year?: string | number;
  start_date?: string;
  end_date?: string;
}

export interface ProfileForSheet {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number | null;
  summary: string | null;
  bio: string | null;
  availability: string | null;
  is_active: boolean;
  hourly_rate_cents: number | null;
  currency: string;
  languages: string[] | null;
  certifications: string[] | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  avatar_url: string | null;
  experience_json?: unknown;
  education?: unknown;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function experiencePeriod(e: ExperienceEntry): string {
  if (e.period) return e.period;
  const start = e.start_date || "";
  const end = e.end_date || (start ? "present" : "");
  return [start, end].filter(Boolean).join(" – ");
}

function educationLine(e: EducationEntry): { head: string; sub: string } {
  const head = [e.degree, e.field].filter(Boolean).join(", ") || e.institution || e.school || "";
  const when = e.year ?? [e.start_date, e.end_date].filter(Boolean).join(" – ");
  const sub = [e.institution || e.school, when].filter((x) => x !== undefined && x !== "" && x !== head).join(" · ");
  return { head, sub };
}

const AVAILABILITY_TONE: Record<string, string> = {
  available: "bg-green-600 text-white",
  partially_available: "bg-amber-500 text-white",
  soon: "bg-amber-500 text-white",
  unavailable: "bg-muted text-muted-foreground",
};

export function ConsultantProfileSheet({
  profile,
  onClose,
  onEdit,
}: {
  profile: ProfileForSheet | null;
  onClose: () => void;
  onEdit?: (profile: ProfileForSheet) => void;
}) {
  const { formatCurrency } = usePlatformFormat();
  const experience = asArray<ExperienceEntry>(profile?.experience_json);
  const education = asArray<EducationEntry>(profile?.education);
  const initials = (profile?.name || "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <Sheet open={!!profile} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {profile && (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="text-base">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl leading-tight">{profile.name}</SheetTitle>
                  <SheetDescription className="text-sm">{profile.title || "—"}</SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge className={`text-xs capitalize ${AVAILABILITY_TONE[profile.availability || ""] || ""}`} variant="secondary">
                      {(profile.availability || "unknown").replace("_", " ")}
                    </Badge>
                    {!profile.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                    {profile.experience_years != null && (
                      <Badge variant="outline" className="text-xs">{profile.experience_years} yrs</Badge>
                    )}
                    {profile.hourly_rate_cents != null && (
                      <Badge variant="outline" className="text-xs">
                        {formatCurrency(profile.hourly_rate_cents / 100, profile.currency)}/h
                      </Badge>
                    )}
                  </div>
                </div>
                {onEdit && (
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => onEdit(profile)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="mt-5 space-y-6">
              {(profile.languages?.length || profile.linkedin_url || profile.portfolio_url) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {!!profile.languages?.length && (
                    <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{profile.languages.join(", ")}</span>
                  )}
                  {profile.linkedin_url && (
                    <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Linkedin className="h-3.5 w-3.5" />LinkedIn
                    </a>
                  )}
                  {profile.portfolio_url && (
                    <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Link2 className="h-3.5 w-3.5" />Portfolio
                    </a>
                  )}
                </div>
              )}

              {profile.summary && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Summary</h3>
                  <p className="text-sm leading-relaxed">{profile.summary}</p>
                </section>
              )}

              {!!profile.skills?.length && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Skills</h3>
                  <div className="flex flex-wrap gap-1">
                    {profile.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </section>
              )}

              {!!experience.length && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" /> Experience
                  </h3>
                  <ol className="relative border-l border-border pl-4 space-y-4">
                    {experience.map((e, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                        <p className="text-sm font-medium leading-tight">
                          {e.title || e.role || "—"}
                          {e.company && <span className="text-muted-foreground font-normal"> · {e.company}</span>}
                        </p>
                        {experiencePeriod(e) && (
                          <p className="text-xs text-muted-foreground">{experiencePeriod(e)}</p>
                        )}
                        {e.description && (
                          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{e.description}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {profile.bio && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Profile</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <WikiMarkdown content={profile.bio} knownSlugs={new Set()} />
                  </div>
                </section>
              )}

              {(!!education.length || !!profile.certifications?.length) && (
                <>
                  <Separator />
                  <div className="grid gap-6 sm:grid-cols-2">
                    {!!education.length && (
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5" /> Education
                        </h3>
                        <ul className="space-y-2">
                          {education.map((e, i) => {
                            const line = educationLine(e);
                            return (
                              <li key={i}>
                                <p className="text-sm font-medium leading-tight">{line.head || "—"}</p>
                                {line.sub && <p className="text-xs text-muted-foreground">{line.sub}</p>}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}
                    {!!profile.certifications?.length && (
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                          <Award className="h-3.5 w-3.5" /> Certifications
                        </h3>
                        <ul className="space-y-1">
                          {profile.certifications.map((c) => (
                            <li key={c} className="text-sm">{c}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
