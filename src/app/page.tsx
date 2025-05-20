import Link from "next/link";

import { HydrateClient } from "~/trpc/server";

export default async function Home() {


  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-100 text-black">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h2 className="text-1xl font-extrabold tracking-tight sm:text-[5rem]">
            Wechselplan
          </h2>      
        </div>
      </main>
    </HydrateClient>
  );
}
