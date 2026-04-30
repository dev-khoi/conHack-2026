import GradientText from "@/components/GradientText";
import Prism from "@/components/Prism";
import { MainWindow } from "@/features/main-window/components/MainWindow";

type MainTabsProps = {
  activeTab: "main" | "sessions";
  screenshotEnabled: boolean;
};

export function MainTabs({ activeTab, screenshotEnabled }: MainTabsProps) {
  if (activeTab === "main") {
    return (
      <div className="relative h-[calc(100dvh-70px)] overflow-hidden">
        {" "}
        {/* min-h → h */}
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Prism
            animationType="rotate"
            timeScale={0.5}
            height={3.5}
            baseWidth={5.5}
            scale={3.6}
            hueShift={0}
            colorFrequency={1}
            noise={0}
            glow={1}
          />
        </div>
        {/* Content */}
        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-3xl items-center justify-center px-6 py-10">
          <div className="w-full rounded-2xl border bg-card/80 p-8 text-center shadow-sm ">
            <GradientText
              colors={["#5227FF", "#FF9FFC", "#B497CF"]}
              animationSpeed={20}
              showBorder={false}
              className="custom-class">
              <h1 className="text-9xl">AURA</h1>
            </GradientText>

            <p className="mt-3 text-base text-muted-foreground">
              Press{" "}
              <span className="font-medium text-foreground">Shift+Space</span>{" "}
              to record.
            </p>

            <p className="mt-1 text-base text-muted-foreground">
              Open <span className="font-medium text-foreground">Sessions</span>{" "}
              to search and ask AI across your captures.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return <MainWindow screenshotEnabled={screenshotEnabled} />;
}
