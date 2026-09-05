// deno test --allow-read supabase/functions/_shared/cold-outreach/camila-display-name.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  isGenericGreetingName,
  looksLikePhoneDigits,
  pickCamilaGreetingName,
} from "./camila-display-name.ts";

Deno.test("generic: LASH / Expert / Maquiagem / Sobrancelha / Studio", () => {
  for (const n of ["LASH", "Expert", "Maquiagem", "Sobrancelha", "Studio", "𝑺𝒕𝒖𝒅𝒊𝒐"]) {
    assertEquals(isGenericGreetingName(n), true, n);
  }
  assertEquals(isGenericGreetingName("Deise"), false);
  assertEquals(isGenericGreetingName("Karolyna"), false);
});

Deno.test("phone-looking chat name is not a vocative", () => {
  assertEquals(looksLikePhoneDigits("5513992028635"), true);
  assertEquals(looksLikePhoneDigits("Jeissiane Castro Nail"), false);
});

Deno.test("piloto: Emilly — IG genérico, handle tem o nome", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "LASH DESIGNER | NITERÓI - RJ",
      handle: "emillylopes_beauty",
      waChatName: "5521971449182",
      primeiroNome: "LASH",
    }),
    "Emilly",
  );
});

Deno.test("piloto: Expert — sem pessoa; não usar Expert", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Expert em Extensões com Naturalidade / Cílios em Santos",
      handle: "lancilashesbeauty",
      waChatName: "5513992028635",
      primeiroNome: "Expert",
    }),
    null,
  );
});

Deno.test("piloto: Eloísa depois da barra", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Sobrancelha Caruaru / Eloísa",
      handle: "eloisalimamicro",
      primeiroNome: "Sobrancelha",
    }),
    "Eloísa",
  );
});

Deno.test("piloto: Vanessa no handle", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Maquiagem e penteado especialista em noivas, BRASILIA",
      handle: "vanessa_araujomakeup",
      primeiroNome: "Maquiagem",
    }),
    "Vanessa",
  );
});

Deno.test("piloto: Jeissiane no chat WA, não Studio", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Studio Jeissiane Castro - Nail designer",
      handle: "jeissianecastronails",
      waChatName: "Jeissiane Castro Nail",
      primeiroNome: "Studio",
    }),
    "Jeissiane",
  );
});

Deno.test("piloto: Deise no chat WA", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Deise  Santos/Unhas",
      handle: "deisesantos_naildesigner",
      waChatName: "Deise Santos Esmalteria",
      primeiroNome: "Deise",
    }),
    "Deise",
  );
});

Deno.test("piloto: Karolyna no IG vence Kssobrancelhas colado", () => {
  assertEquals(
    pickCamilaGreetingName({
      igName: "Karolyna | Designer de sobrancelhas| Feira de Santana Ba",
      handle: "studioksobranceelhas",
      waChatName: "Kssobrancelhas",
      primeiroNome: "Karolyna",
    }),
    "Karolyna",
  );
});
