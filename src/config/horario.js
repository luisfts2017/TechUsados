"use strict";

const HORARIO = {
  abertura: parseInt(process.env.HORA_ABERTURA || "8", 10),
  fechamento: parseInt(process.env.HORA_FECHAMENTO || "18", 10),
  diasUteis: [1, 2, 3, 4, 5],
};

const PAUSAR_FORA_DO_HORARIO = process.env.PAUSAR_FORA_DO_HORARIO !== "false";

module.exports = { HORARIO, PAUSAR_FORA_DO_HORARIO };
