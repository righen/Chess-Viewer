import { PgnService } from '../services/PgnService';

describe('PgnService', () => {
    let pgnService: PgnService;

    beforeEach(() => {
        pgnService = PgnService.getInstance();
    });

    describe('loadFromText', () => {
        it('should successfully load a valid PGN text', () => {
            const pgnText = `[Event "Test Game"]
[Site "Chess Club"]
[Date "2024.02.24"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            expect(result.games.length).toBe(1);
            expect(result.games[0].headers).toEqual({
                Event: "Test Game",
                Site: "Chess Club",
                Date: "2024.02.24",
                Round: "1",
                White: "Player 1",
                Black: "Player 2",
                Result: "1-0"
            });
            expect(result.games[0].moves.length).toBe(6); // e4, e5, Nf3, Nc6, Bb5, a6
        });

        it('should handle multiple games in PGN text', () => {
            const pgnText = `[Event "Game 1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Game 2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            expect(result.games.length).toBe(2);
            expect(result.games[0].headers.Event).toBe("Game 1");
            expect(result.games[1].headers.Event).toBe("Game 2");
        });

        it('should handle missing headers with defaults', () => {
            const pgnText = `1. e4 e5 2. Nf3 Nc6`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            expect(result.games[0].headers).toEqual({
                White: "Unknown",
                Black: "Unknown",
                Date: "Unknown",
                Event: "Unknown",
                Site: "Unknown",
                Result: "*",
                Round: "-"
            });
        });

        it('should handle invalid PGN text', () => {
            const pgnText = `Invalid PGN text`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(false);
            expect(result.games).toEqual([]);
            expect(result.error).toBeDefined();
        });

        it('should correctly parse moves and FEN positions', () => {
            const pgnText = `[Event "Test Game"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            const moves = result.games[0].moves;
            expect(moves.length).toBe(3);
            
            // Check first move
            expect(moves[0].san).toBe('e4');
            expect(moves[0].fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
            
            // Check second move
            expect(moves[1].san).toBe('e5');
            expect(moves[1].fen.split(' ')[0]).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
        });

        it('should preserve custom headers', () => {
            const pgnText = `[Event "Test Game"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[WhiteElo "2800"]
[BlackElo "2700"]
[ECO "B90"]
[Opening "Sicilian Defense"]

1. e4 c5 1-0`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            expect(result.games[0].headers).toMatchObject({
                WhiteElo: "2800",
                BlackElo: "2700",
                ECO: "B90",
                Opening: "Sicilian Defense"
            });
        });

        it('should handle empty variations array', () => {
            const pgnText = `[Event "Test Game"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 1-0`;

            const result = pgnService.loadFromText(pgnText);

            expect(result.success).toBe(true);
            result.games[0].moves.forEach(move => {
                expect(move.variations).toEqual([]);
            });
        });

        it('should correctly parse tournament games with detailed headers and moves', () => {
            const pgnText = `[Event "OPEN INTER REUNION 2023"]
[Site "SALLE DES FETES DE BELLEPIERRE"]
[Date "2023.10.14"]
[Round "1.1"]
[White "Velten, Paul"]
[Black "Delestage, Raphael"]
[Result "1-0"]
[WhiteElo "2487"]
[BlackElo "1344"]
[PlyCount "79"]
[EventDate "2023.??.??"]
[WhiteTeam "L'Echiquier Châlonnais"]
[BlackTeam "Club Echiquier du Nord"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Be2 Nbd7 6. Nf3 e5 7. d5 Nc5 8. Qc2
a5 9. Bg5 a4 10. Nd2 Bd7 11. Rb1 Qc8 12. b4 axb3 13. axb3 O-O 14. O-O h5 15. b4
Na4 16. Nb5 Nh7 17. Be3 f5 18. f3 f4 19. Bf2 g5 20. Ra1 Bxb5 21. cxb5 Nb6 22.
Rac1 Bf6 23. Nb3 Ra3 24. Bxb6 Rf7 25. h3 Bd8 26. Bf2 Nf6 27. Na5 g4 28. Nc4 Rg7
29. fxg4 Rxh3 30. Nb6 hxg4 31. Nxc8 Rh6 32. Be1 g3 33. Qd3 Rgh7 34. Bxg3 fxg3
35. Qxg3+ Kh8 36. Bf3 Rg7 37. Qxg7+ Kxg7 38. b6 cxb6 39. Nxd6 b5 40. Nf5+ 1-0

[Event "OPEN INTER REUNION 2023"]
[Site "SALLE DES FETES DE BELLEPIERRE"]
[Date "2023.10.14"]
[Round "1.2"]
[White "Folio, Raphael"]
[Black "Mouhamad, Joachim"]
[Result "0-1"]
[WhiteElo "1297"]
[BlackElo "2303"]
[PlyCount "102"]
[EventDate "2023.??.??"]
[WhiteTeam "La Tour Saint Pierroise"]
[BlackTeam "Barreau de Paris Echecs"]

1. d4 d5 2. Nf3 e6 3. e3 Nf6 4. Bd3 Bd6 5. O-O O-O 6. b3 b6 7. Bb2 Bb7 8. Nbd2
Nbd7 9. Rc1 Qe7 10. Qe2 Ne4 11. c4 a5 12. cxd5 exd5 13. Bb1 f5 14. Rfe1 Rf7 15.
a3 g5 16. Nf1 g4 17. N3d2 Qh4 18. f4 Ba6 19. Bd3 Bxd3 20. Qxd3 Qf2+ 21. Kh1
Qxe1 22. Nxe4 dxe4 23. Qc4 Qh4 24. Qc3 Qf6 25. Ng3 Qg6 26. Rd1 h5 27. d5 Kh7
28. Qc6 Rg8 29. b4 axb4 30. axb4 Bxb4 31. Qxc7 Bf8 32. Ne2 Nc5 33. Qc6 Nd3 34.
Rb1 Qxc6 35. dxc6 Nxb2 36. Rxb2 Bc5 37. Nd4 Rd8 38. g3 Bxd4 39. exd4 Rxd4 40.
Rxb6 Ra7 41. Rb7+ Rxb7 42. cxb7 Rb4 43. Kg2 Rxb7 44. h3 Rb2+ 45. Kf1 gxh3 46.
Kg1 h2+ 47. Kh1 Rf2 48. g4 fxg4 49. f5 e3 50. f6 e2 51. f7 e1=Q# 0-1`;

            const result = pgnService.loadFromText(pgnText);

            // Test overall success
            expect(result.success).toBe(true);
            expect(result.games.length).toBe(2);

            // Test first game
            const game1 = result.games[0];
            console.log('Game 1 headers:', game1.headers);
            expect(game1.headers).toEqual({
                Event: "OPEN INTER REUNION 2023",
                Site: "SALLE DES FETES DE BELLEPIERRE",
                Date: "2023.10.14",
                Round: "1.1",
                White: "Velten, Paul",
                Black: "Delestage, Raphael",
                Result: "1-0",
                WhiteElo: "2487",
                BlackElo: "1344",
                PlyCount: "79",
                EventDate: "2023.??.??",
                WhiteTeam: "L'Echiquier Châlonnais",
                BlackTeam: "Club Echiquier du Nord"
            });
            expect(game1.moves.length).toBe(79); // 40 moves minus the last one which is a mate
            expect(game1.moves[0].san).toBe('d4');
            expect(game1.moves[1].san).toBe('Nf6');

            // Test second game
            const game2 = result.games[1];
            console.log('Game 2 headers:', game2.headers);
            expect(game2.headers).toEqual({
                Event: "OPEN INTER REUNION 2023",
                Site: "SALLE DES FETES DE BELLEPIERRE",
                Date: "2023.10.14",
                Round: "1.2",
                White: "Folio, Raphael",
                Black: "Mouhamad, Joachim",
                Result: "0-1",
                WhiteElo: "1297",
                BlackElo: "2303",
                PlyCount: "102",
                EventDate: "2023.??.??",
                WhiteTeam: "La Tour Saint Pierroise",
                BlackTeam: "Barreau de Paris Echecs"
            });
            expect(game2.moves.length).toBe(102); // 51 full moves
            expect(game2.moves[0].san).toBe('d4');
            expect(game2.moves[game2.moves.length - 1].san).toBe('e1=Q#'); // Last move should be a queen promotion with mate

            // Test FEN positions for key moments
            // First game - Position after 7. d5
            const fenPosition = game1.moves[13].fen.split(' ')[0];
            expect(fenPosition).toBe('r1bqk2r/ppp2pbp/3p1np1/2nPp3/2P1P3/2N2N2/PP2BPPP/R1BQK2R');
            
            // Second game - Position before the final mate
            const finalPosition = game2.moves[game2.moves.length - 2].fen;
            console.log('Game 2 final position FEN:', finalPosition);
            expect(finalPosition).toContain('8/5P1k/8/7p/6p1/8/4pr1p/7K');
        });
    });
}); 