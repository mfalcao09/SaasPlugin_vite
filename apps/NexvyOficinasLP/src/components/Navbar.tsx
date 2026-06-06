import { useState } from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { buttonVariants } from "./ui/button";
import { Menu, Wrench } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const APP_URL = "https://app.nexvyoficinas.com.br";

interface RouteProps {
  href: string;
  label: string;
}

const routeList: RouteProps[] = [
  { href: "#features", label: "Funções" },
  { href: "#pricing", label: "Preços" },
  { href: "#faq", label: "FAQ" },
];

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <header className="sticky border-b-[1px] top-0 z-40 w-full bg-white dark:border-b-slate-700 dark:bg-background">
      <NavigationMenu className="mx-auto">
        <NavigationMenuList className="container h-14 px-4 w-screen flex justify-between ">
          <NavigationMenuItem className="font-bold flex">
            <a
              rel="noreferrer noopener"
              href="/"
              className="ml-2 font-bold text-xl flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-orange-500" />
              </div>
              NexvyOficinas
            </a>
          </NavigationMenuItem>

          {/* mobile */}
          <span className="flex md:hidden">
            <ModeToggle />

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger className="px-2">
                <Menu
                  className="flex md:hidden h-5 w-5"
                  onClick={() => setIsOpen(true)}
                >
                  <span className="sr-only">Menu</span>
                </Menu>
              </SheetTrigger>

              <SheetContent side={"left"}>
                <SheetHeader>
                  <SheetTitle className="font-bold text-xl">
                    NexvyOficinas
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col justify-center items-center gap-2 mt-4">
                  {routeList.map(({ href, label }: RouteProps) => (
                    <a
                      rel="noreferrer noopener"
                      key={label}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={buttonVariants({ variant: "ghost" })}
                    >
                      {label}
                    </a>
                  ))}
                  <a
                    href={`${APP_URL}/login`}
                    onClick={() => setIsOpen(false)}
                    className={buttonVariants({ variant: "ghost" })}
                  >
                    Entrar
                  </a>
                  <a
                    href={`${APP_URL}/signup`}
                    onClick={() => setIsOpen(false)}
                    className={`${buttonVariants({})} bg-orange-600 hover:bg-orange-700 text-white`}
                  >
                    Começar grátis
                  </a>
                </nav>
              </SheetContent>
            </Sheet>
          </span>

          {/* desktop */}
          <nav className="hidden md:flex gap-2">
            {routeList.map((route: RouteProps, i) => (
              <a
                rel="noreferrer noopener"
                href={route.href}
                key={i}
                className={`text-[17px] ${buttonVariants({ variant: "ghost" })}`}
              >
                {route.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex gap-2 items-center">
            <a
              href={`${APP_URL}/login`}
              className={buttonVariants({ variant: "ghost" })}
            >
              Entrar
            </a>
            <a
              href={`${APP_URL}/signup`}
              className={`${buttonVariants({})} bg-orange-600 hover:bg-orange-700 text-white`}
            >
              Começar grátis
            </a>
            <ModeToggle />
          </div>
        </NavigationMenuList>
      </NavigationMenu>
    </header>
  );
};
