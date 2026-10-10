(function (root) {
    'use strict';

    var banks = {
        A2: [
            { prompt: 'Translate: “I usually walk to school.”', answers: ['normalmente camino a la escuela', 'normalmente voy caminando a la escuela', 'suelo caminar a la escuela'] },
            { prompt: 'Translate: “She is cooking dinner right now.”', answers: ['ella está preparando la cena ahora', 'ella está cocinando la cena ahora', 'está cocinando la cena en este momento'] },
            { prompt: 'Translate: “We visited our grandparents last weekend.”', answers: ['visitamos a nuestros abuelos el fin de semana pasado', 'fuimos a visitar a nuestros abuelos el fin de semana pasado'] },
            { prompt: 'Translate: “There are two books on the table.”', answers: ['hay dos libros sobre la mesa', 'hay dos libros en la mesa'] },
            { prompt: 'Translate: “My brother can swim very well.”', answers: ['mi hermano sabe nadar muy bien', 'mi hermano puede nadar muy bien'] },
            { prompt: 'Translate: “I am going to call you tomorrow.”', answers: ['voy a llamarte mañana', 'te voy a llamar mañana', 'voy a llamarlo mañana', 'voy a llamarla mañana'] },
            { prompt: 'Translate: “How often do you go to the gym?”', answers: ['con qué frecuencia vas al gimnasio', 'cada cuánto vas al gimnasio', 'con qué frecuencia vas al gym'] },
            { prompt: 'Translate: “The train is cheaper than the bus.”', answers: ['el tren es más barato que el autobús', 'el tren cuesta menos que el autobús'] },
            { prompt: 'Translate: “I have never eaten Japanese food.”', answers: ['nunca he comido comida japonesa', 'jamás he comido comida japonesa'] },
            { prompt: 'Translate: “Could you open the window, please?”', answers: ['podrías abrir la ventana por favor', 'puedes abrir la ventana por favor', 'podría abrir la ventana por favor'] },
            { prompt: 'Translate: “They were at home yesterday.”', answers: ['ellos estaban en casa ayer', 'ellas estaban en casa ayer', 'estaban en casa ayer'] },
            { prompt: 'Translate: “I need a bigger bottle of water.”', answers: ['necesito una botella de agua más grande', 'necesito una botella más grande de agua'] },
            { prompt: 'Complete the sentence: “She ___ to school every day.”', answers: ['goes'], answerLanguage: 'en' },
            { prompt: 'Complete the sentence: “There ___ three chairs in the kitchen.”', answers: ['are'], answerLanguage: 'en' },
            { prompt: 'What is the past tense of “buy”?', answers: ['bought'], answerLanguage: 'en' }
        ],
        B1: [
            { prompt: 'Translate: “If it rains tomorrow, we will stay at home.”', answers: ['si llueve mañana nos quedaremos en casa', 'si mañana llueve nos quedaremos en casa', 'si llueve mañana nos quedamos en casa'] },
            { prompt: 'Translate: “I have been learning English for two years.”', answers: ['he estado aprendiendo inglés durante dos años', 'llevo dos años aprendiendo inglés', 'he estado estudiando inglés por dos años'] },
            { prompt: 'Translate: “Although the journey was long, we enjoyed it.”', answers: ['aunque el viaje fue largo lo disfrutamos', 'aunque el trayecto fue largo lo disfrutamos', 'a pesar de que el viaje fue largo lo disfrutamos'] },
            { prompt: 'Translate: “You should compare the prices before you buy it.”', answers: ['deberías comparar los precios antes de comprarlo', 'deberías comparar los precios antes de que lo compres', 'debes comparar los precios antes de comprarlo'] },
            { prompt: 'Translate: “She told me she had already finished the report.”', answers: ['ella me dijo que ya había terminado el informe', 'me dijo que ya había terminado el informe', 'ella me dijo que ya había terminado el reporte'] },
            { prompt: 'Translate: “I would travel more if I had enough time.”', answers: ['viajaría más si tuviera suficiente tiempo', 'viajaría más si tuviese suficiente tiempo'] },
            { prompt: 'Translate: “He has worked here since he graduated.”', answers: ['él ha trabajado aquí desde que se graduó', 'ha trabajado aquí desde que se graduó'] },
            { prompt: 'Translate: “We were having dinner when the phone rang.”', answers: ['estábamos cenando cuando sonó el teléfono', 'estábamos cenando cuando sonó el celular', 'cenábamos cuando sonó el teléfono'] },
            { prompt: 'Translate: “The meeting was cancelled because the manager was ill.”', answers: ['la reunión fue cancelada porque el gerente estaba enfermo', 'cancelaron la reunión porque el gerente estaba enfermo', 'la reunión se canceló porque el gerente estaba enfermo'] },
            { prompt: 'Translate: “I have not decided where to spend my holidays yet.”', answers: ['todavía no he decidido dónde pasar mis vacaciones', 'aún no he decidido dónde pasar mis vacaciones'] },
            { prompt: 'Translate: “She asked me whether I could help her.”', answers: ['ella me preguntó si podía ayudarla', 'me preguntó si podía ayudarla', 'ella me preguntó si podía ayudarle'] },
            { prompt: 'Translate: “Despite being tired, they continued working.”', answers: ['a pesar de estar cansados continuaron trabajando', 'aunque estaban cansados siguieron trabajando', 'a pesar de que estaban cansados continuaron trabajando'] },
            { prompt: 'Complete the sentence: “If I ___ more time, I would learn another language.”', answers: ['had'], answerLanguage: 'en' },
            { prompt: 'Complete the sentence: “Although she was tired, she ___ working.”', answers: ['continued'], answerLanguage: 'en' },
            { prompt: 'Complete the sentence: “I have lived here ___ 2020.”', answers: ['since'], answerLanguage: 'en' }
        ]
    };

    function normalizeAnswer(value) {
        return String(value || '').toLocaleLowerCase('es').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:"'“”‘’]/g, '')
            .replace(/\s+/g, ' ').trim();
    }

    function isCorrect(question, answer) {
        var normalized = normalizeAnswer(answer);
        return !!normalized && question.answers.some(function (candidate) {
            return normalizeAnswer(candidate) === normalized;
        });
    }

    function createSession(level, random) {
        var bank = banks[level] || banks.A2;
        var rng = random || Math.random;
        var deck = bank.slice();
        // Fisher-Yates gives a shuffled deck and guarantees no repeats until
        // the whole level bank has been used.
        for (var i = deck.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var temp = deck[i]; deck[i] = deck[j]; deck[j] = temp;
        }
        var index = 0;
        return {
            level: level === 'B1' ? 'B1' : 'A2',
            next: function () {
                if (index >= deck.length) {
                    deck = bank.slice();
                    for (var k = deck.length - 1; k > 0; k--) {
                        var n = Math.floor(rng() * (k + 1));
                        var item = deck[k]; deck[k] = deck[n]; deck[n] = item;
                    }
                    index = 0;
                }
                return deck[index++];
            },
            size: bank.length
        };
    }

    function createMilestoneTracker(interval, initialScore) {
        var step = Math.max(1, Number(interval) || 300);
        var next = (Math.floor(Math.max(0, Number(initialScore) || 0) / step) + 1) * step;
        return {
            observe: function (score) {
                var reached = [];
                var value = Number(score) || 0;
                while (value >= next) { reached.push(next); next += step; }
                return reached;
            },
            next: function () { return next; }
        };
    }

    function milestonePenalty(milestone, interval, basePenalty) {
        var step = Math.max(1, Number(interval) || 300);
        var base = Math.max(0, Number(basePenalty) || 10);
        var level = Math.ceil(Math.max(0, Number(milestone) || 0) / step);
        return level * base;
    }

    var api = {
        banks: banks,
        normalizeAnswer: normalizeAnswer,
        isCorrect: isCorrect,
        createSession: createSession,
        createMilestoneTracker: createMilestoneTracker,
        milestonePenalty: milestonePenalty
    };
    root.PlanetHopEnglish = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
