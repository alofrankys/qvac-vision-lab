# QVAC VisionPsy: replica dei 17 benchmark ufficiali

## Decisione

Il pacchetto `visionpsy-smart-100-04` resta un test sintetico **ispirato** alle capacità dichiarate. Non deve più essere presentato come riproduzione del benchmark QVAC.

La replica ufficiale usa invece:

1. gli stessi 17 dataset pubblici elencati da QVAC;
2. VLMEvalKit e le quattro patch indicate da QVAC;
3. i tre checkpoint originali VisionPsy-Nano-460M, LFM2.5-VL-450M e SmolVLM2-500M;
4. le metriche ufficiali di ciascun dataset;
5. risultati strict e risultati con giudice sempre separati;
6. una seconda esecuzione Q8 locale, separata dalla classifica reference.

Il protocollo machine-readable è in `config/qvac-official-replication.json`.

## Ordine

- **Headline**: ScienceQA_TEST (2017 casi), MM-IFEval (400), POPE (5127). Sono i tre benchmark completi sui quali QVAC dichiara anche il vantaggio contro modelli più grandi.
- **Strict-first**: nove suite valutabili senza attribuire equivalenza semantica a un giudice non ancora identificato in modo immutabile.
- **Judge-backed**: OCRBench, DocVQA, ChartQA, InfoVQA, TextVQA, MathVista, MMVet e MM-IFEval.
- **Full-17**: aggregazione finale soltanto quando tutti e tre i modelli hanno completato lo stesso protocollo.
- **Local-Q8**: stessi dataset e metriche con gli artifact del laboratorio. Il risultato misura il deployment locale, non sostituisce la replica reference.

I tre headline contano 7.544 unità di valutazione per modello. Il TSV di MM-IFEval contiene in realtà 687 righe: 400 casi `main`, che sono le unità dichiarate da QVAC, e 287 prompt `aux_cmp_gpt` necessari al confronto. Perciò il workload headline è di 7.831 inferenze per modello, ma il denominatore dei risultati resta 7.544.

## Dataset bloccati

Ogni esecuzione ricalcola MD5 e SHA-256 prima di partire. Il run viene rifiutato se byte o numerosità non coincidono.

| Dataset | Unità valutate | Righe inferite | MD5 ufficiale |
|---|---:|---:|---|
| ScienceQA_TEST | 2.017 | 2.017 | `e42e9e00f9c59a80d8a5db35bc32b71f` |
| POPE | 5.127 | 5.127 | `c12f5acb142f2ef1f85a26ba2fbe41d5` |
| MM-IFEval | 400 | 687 | `973bb839961a449565073a5ee70ae7a6` |

L'inventario completo, inclusi SHA-256, dimensioni e motivi di eventuale rifiuto, è scritto in `data/qvac-official-replication/dataset-inventory.json`. Ogni run ha inoltre un manifesto autonomo in `data/qvac-official-replication/runs/*.manifest.json`, con hash del protocollo, revisioni dei modelli, dataset, comando, device e regole di classifica.

## Blocchi di riproducibilità scoperti

1. QVAC non pubblica un commit combinato di VLMEvalKit. Le quattro PR partono da due basi differenti. La nostra ricostruzione blocca la base `63a279f...`, genitore condiviso dalle PR più recenti, e applica tutte e quattro le patch.
2. Le quattro PR non registrano `LFM2.5-VL-450M`, pur essendo il competitor principale nella tabella. È stato aggiunto un semplice shim di registrazione, dichiarato e separato.
3. Il blog nomina il giudice `Qwen3.6-27B`; la scheda GGUF nomina `Qwen3-27B-FP8`. Non sono pubblicati revisione immutabile, parametri del server o output di valutazione. Finché QVAC non chiarisce, i punteggi judge-backed sono riproduzioni approssimate; quelli strict restano verificabili.
4. Il blog non specifica esplicitamente ogni split. `MMBench_DEV_EN` e `MMMU_DEV_VAL` sono scelte inferite dal codice VLMEvalKit e sono marcate come tali nel protocollo.
5. Gli adapter QVAC pubblicati usano CUDA in modo esplicito. Il Mac M4 può eseguire la replica Q8 locale, ma non la replica Transformers reference senza una modifica del device che romperebbe la fedeltà bit-for-bit.
6. QVAC indica i repository dei modelli, ma non blocca le revisioni Hub. Questa replica registra gli hash osservati al primo download nel protocollo; sono un nostro lock di riproducibilità, non una revisione dichiarata da QVAC.
7. Il runtime GGUF VisionPsy richiede che l'immagine preceda il testo nel messaggio. Il provider locale ora blocca esplicitamente l'ordine `image_url`, poi `text`, e un test automatico impedisce la regressione. Questo corregge il confronto Q8, ma non modifica il percorso Transformers pubblicato da QVAC.

Per rendere eseguibile lo stesso codice su MPS è inclusa una patch di portabilità che sostituisce soltanto il device hard-coded. Dataset, prompt, preprocessing, checkpoint e generazione greedy restano quelli delle PR QVAC. I risultati ottenuti così vanno etichettati **MPS port**, non CUDA reference.

## Risultato completo già verificato: ScienceQA

Il 21 agosto 2026 tutti e tre i modelli hanno completato gli stessi 2.017 casi ufficiali con exact matching VLMEvalKit, zero inferenze fallite:

| Modello | Risultato MPS port | QVAC pubblicato | Differenza |
|---|---:|---:|---:|
| LFM2.5-VL-450M | 77,5905% | 77,7% | -0,1095 pp |
| SmolVLM2-500M | 76,3510% | 76,3% | +0,0510 pp |
| VisionPsy-Nano-460M | 39,8612% | 86,5% | -46,6388 pp |

LFM e Smol replicano quasi esattamente i valori pubblicati. Il forte scarto di VisionPsy è quindi specifico del percorso Transformers/QVAC e non è spiegato da dataset, denominatore o scorer. In un controllo separato, il GGUF VisionPsy Q8 con ordine immagine-prima ha ottenuto 1.574/2.017, cioè 78,0367%. Questo prova che il modello è molto migliore del 39,86% nel runtime corretto, ma non riproduce ancora l'86,5% dichiarato.

## Primo smoke condiviso

Il 21 agosto 2026 è stata eseguita la riga 0 di `ScienceQA_TEST` tramite i tre adapter QVAC/VLMEvalKit, sullo stesso dato pubblico e con gold `B`:

| Modello | Risposta |
|---|---|
| VisionPsy-Nano-460M | `The answer is B` |
| LFM2.5-VL-450M | `B` |
| SmolVLM2-500M | `B` |

Tutti e tre superano questo smoke test. È una prova end-to-end di dataset, prompt, immagine, adapter e generazione; una sola domanda non misura quale modello sia migliore.

## Comandi

```sh
npm run qvac:replica:status
npm run qvac:replica:plan
node scripts/qvac-official-replication.mjs command --suite headline --models VisionPsy-Nano-460M --no-judge
npm run qvac:replica:start
npm run qvac:replica:progress
npm run qvac:replica:leaderboard
npm run qvac:replica:report -- --suite scienceQA
npm run qvac:replica:pope-leaderboard
npm run qvac:replica:inventory
npm run qvac:replica:datasets -- headline
```

Su una macchina CUDA, il setup completo è:

```sh
sh scripts/setup-qvac-official-replication.sh --with-python
```

Smoke MPS attraverso l'adapter QVAC reale:

```sh
sh scripts/run-qvac-reference-smoke.sh \
  --model VisionPsy-Nano-460M \
  --image /percorso/immagine.png \
  --dataset ScienceQA_TEST \
  --prompt "Question... Options..."
```

Per usare direttamente una riga del dataset pubblico, omettere immagine e prompt:

```sh
sh scripts/run-qvac-reference-smoke.sh \
  --model VisionPsy-Nano-460M \
  --dataset ScienceQA_TEST \
  --index 0
```

Non usare `--no-judge` per pubblicare la classifica QVAC completa. Serve soltanto per produrre il primo livello strict e diagnosticare inferenza, prompt e split prima di collegare il giudice corretto.

`qvac:replica:start` avvia per impostazione predefinita ScienceQA completo sui tre modelli, in sequenza, impedisce lo sleep del Mac e riusa i checkpoint di inferenza dopo un'interruzione. `qvac:replica:progress` mostra se il processo è vivo, gli stati VLMEvalKit e la coda del log. I checkpoint Hub già scaricati vengono usati offline alle revisioni registrate nel protocollo.

`qvac:replica:leaderboard` calcola la fotografia ScienceQA dai checkpoint: accuratezza cumulativa, ultime 100 risposte e intervallo di confidenza. `qvac:replica:pope-leaderboard` fa lo stesso per POPE usando l'F1 ufficiale e un intervallo bootstrap. In entrambi i casi il confronto provvisorio usa esclusivamente gli indici completati da tutti i modelli già partiti. `qvac:replica:report` emette una classifica per dataset solo quando tutti i modelli selezionati hanno finito l'intero dataset bloccato; non produce mai un aggregato Full-17 incompleto.
