import { getFlagUrl, type FlagRatio } from "@/lib/flags";
import { cn } from "@/lib/utils";

type CountryFlagProps = {
  code?: string | null;
  ratio?: FlagRatio;
  className?: string;
  title?: string;
};

export function CountryFlag({
  code,
  ratio = "4x3",
  className,
  title,
}: CountryFlagProps) {
  const src = getFlagUrl(code, ratio);
  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] text-muted-foreground",
          ratio === "1x1" ? "h-4 w-4" : "h-3 w-4",
          className,
        )}
        title={title}
      >
        <i className="fa-solid fa-earth-americas text-[9px]" aria-hidden />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block shrink-0 rounded-sm object-cover ring-1 ring-black/5",
        ratio === "1x1" ? "h-4 w-4" : "h-3 w-4",
        className,
      )}
      title={title}
    />
  );
}
