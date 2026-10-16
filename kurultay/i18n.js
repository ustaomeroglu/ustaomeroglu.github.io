/* Kurultay — languages. The game is written in English; for Turkish, text is translated as it is put on the page.
   Entries are [English, Turkish]. {x} stands for any text (names, numbers), {#} for a number only.
   Short labels (one to three plain words) only change whole labels, never parts of sentences. */
(function () {
  'use strict';
  const CC = window.CC;
  const KEY = 'kurultay-lang';
  const I = (CC.I18N = { lang: 'en' });
  try {
    const saved = localStorage.getItem(KEY);
    I.lang = saved || (/^tr\b/i.test(navigator.language || '') ? 'tr' : 'en');
  } catch (e) { /* storage blocked: English */ }

  const TR = [
    // ---------------------------------------------------------------- top bar, tabs, menus
    ['Round', 'Tur'], ['Treasury', 'Hazine'], ['Orders', 'Emirler'], ['Stats', 'İstatistik'], ['Rules', 'Kurallar'], ['Menu', 'Menü'],
    ['End turn', 'Sırayı bitir'], ['Really end turn?', 'Gerçekten bitirilsin mi?'], ['Turn', 'Sıra'], ['Diplomacy', 'Diplomasi'], ['Chronicle', 'Vakayiname'],
    ['Finish your turn and let the next house play. Shortcut: E', 'Sıranı bitir, sıradaki hanedan oynasın. Kısayol: E'],
    ['Time left in this turn. When it runs out, your turn ends by itself.', 'Bu sıradan kalan süre. Süre bitince sıran kendiliğinden biter.'],
    ['The game is over.', 'Oyun bitti.'], ['Wait for your turn.', 'Sıranı bekle.'],
    ['{x} is on the march…', '{x} yürüyüşte…'], ['Waiting for {x}', '{x} bekleniyor'],
    ['Drag to paint · right-drag or drag a painted tile to erase · <b>Shift</b>-click sets where the army stops · paint onto another of your armies to join it', 'Boyamak için sürükle · silmek için sağ tıkla sürükle ya da boyalı kareyi sürükle · <b>Shift</b>-tık ordunun duracağı yeri seçer · başka ordunun üstüne boyarsan ona katılır'],
    ['Sound on', 'Ses açık'], ['Sound off', 'Ses kapalı'], ['Sound is on. Click to mute.', 'Ses açık. Kapatmak için tıkla.'], ['Sound is off. Click to turn it on.', 'Ses kapalı. Açmak için tıkla.'],
    ['Computer turn speed', 'Bilgisayar sırası hızı'], ['Sound volume', 'Ses düzeyi'], ['Slow', 'Yavaş'], ['Normal', 'Normal'], ['Fast', 'Hızlı'], ['Instant', 'Anında'],
    ['This game saves itself in this browser after every action.', 'Bu oyun her hamleden sonra bu tarayıcıya kaydedilir.'],
    ['Tutorial', 'Öğretici'], ['New game', 'Yeni oyun'], ['Set up a game', 'Oyun kur'], ['Close', 'Kapat'], ['Continue', 'Devam'], ['Cancel', 'Vazgeç'], ['Language', 'Dil'],
    ['Back to the map', 'Haritaya dön'], ['View the map', 'Haritaya bak'], ['Begin turn', 'Sıraya başla'], ['Final standings', 'Son durum'],
    // ---------------------------------------------------------------- side panel
    ['Your turn', 'Sıra sende'], ['Their turn', 'Onların sırası'], ['CPU', 'YZ'], ['YOU', 'SEN'], ['AWAY', 'YOK'],
    ['is making their moves', 'hamlelerini yapıyor'], ['is playing their turn', 'sırasını oynuyor'], ['is thinking', 'düşünüyor'],
    ['Gold', 'Altın'], ['Farms', 'Çiftlik'], ['Trade', 'Ticaret'], ['Ready to move', 'Hareket edebilir'],
    ['Nothing left to move. Recruit, build, or end your turn.', 'Hareket ettirecek bir şey kalmadı. Asker topla, inşa et ya da sıranı bitir.'],
    ['Click to command · right-click to inspect · <kbd>N</kbd> next · <kbd>E</kbd> end turn', 'Komut için tıkla · incelemek için sağ tıkla · <kbd>N</kbd> sonraki · <kbd>E</kbd> sırayı bitir'],
    ['{x} · {#} steps', '{x} · {#} adım'], ['{x} · {#} step', '{x} · {#} adım'], ['at sea · {#} moves', 'denizde · {#} hamle'],
    ['{#} of {#} steps left', '{#}/{#} adım kaldı'], ['{#} of {#} step left', '{#}/{#} adım kaldı'], ['{#} of {#} sea moves left', '{#}/{#} deniz hamlesi kaldı'],
    ['{#} warships. {#} moves left, guns ready.', '{#} savaş gemisi. {#} hamle kaldı, toplar hazır.'], ['{#} warship. {#} moves left, guns ready.', '{#} savaş gemisi. {#} hamle kaldı, toplar hazır.'],
    ['{#} warships. {#} moves left, guns fired.', '{#} savaş gemisi. {#} hamle kaldı, toplar ateşlendi.'], ['{#} warship. {#} moves left, guns fired.', '{#} savaş gemisi. {#} hamle kaldı, toplar ateşlendi.'],
    ['The chronicle is closed', 'Vakayiname kapandı'], ['{x} won the realm.', '{x} diyarı kazandı.'],
    ['Rebel garrison', 'Asi garnizonu'], ['Army · {#}', 'Ordu · {#}'], ['Army at sea · {#}', 'Denizdeki ordu · {#}'], ['{x} at sea · {#}', '{x} denizde · {#}'],
    ['Landed from the sea: marches again next turn.', 'Denizden çıktı: sonraki sırada yine yürür.'], ['Lost a battle: done for this turn.', 'Savaş kaybetti: bu sıra bitti.'], ['No steps left this turn.', 'Bu sıra için adım kalmadı.'],
    ['This land', 'Bu toprak'], ['Land', 'Toprak'], ['Steps', 'Adım'], ['Order', 'Emir'], ['free', 'bedava'], ['Fatigue', 'Yorgunluk'], ['Moves', 'Hamle'], ['Guns', 'Toplar'], ['ready', 'hazır'], ['fired', 'ateşlendi'],
    ['All', 'Hepsi'], ['Half', 'Yarısı'], ['One', 'Bir'],
    ['Send the whole army', 'Tüm orduyu gönder'], ['Send half, keep half here', 'Yarısını gönder, yarısı burada kalsın'], ['Send one soldier: enough to claim an empty tile or guard a farm', 'Bir asker gönder: boş bir kareyi almaya ya da çiftliği korumaya yeter'],
    ['{#} of {#}', '{#}/{#}'],
    ['A won battle costs 1 to 4 extra steps; losing one ends the turn.', 'Kazanılan savaş 1–4 adım daha yer; kaybedilen savaş sırayı bitirir.'],
    ['Win them all ≈', 'Hepsini kazanma ≈'],
    ['Ends at {x} (turns back out of the zone)', '{x} karesinde durur (bölgeden geri çekilir)'], ['Ends at {x}', '{x} karesinde durur'],
    ['Paint tiles on the map to march. Paint onto another of your armies to join it.', 'Yürümek için haritada kare boya. Başka ordunun üstüne boyarsan ona katılır.'],
    ['Paint tiles on the map first.', 'Önce haritada kare boya.'], ['Go (Enter)', 'Git (Enter)'],
    ['Attack', 'Saldır'], ['March and claim', 'Yürü ve al'], ['March', 'Yürü'], ['Clear', 'Temizle'],
    ['Nothing painted yet.', 'Henüz bir şey boyanmadı.'], ['Erase the painted tiles (Esc)', 'Boyalı kareleri sil (Esc)'],
    ['Build on the tile this army stands on', 'Bu ordunun durduğu kareye inşa et'],
    ['Board ships · {#}g', 'Gemiye bin · {#} altın'],
    ['Put {#} soldiers aboard ships for {#} gold. At sea they sail {#} tiles a turn, but warships can sink them.', '{#} askeri {#} altına gemilere bindir. Denizde sırada {#} kare giderler ama savaş gemileri onları batırabilir.'],
    ['Put {#} soldier aboard ships for {#} gold. At sea they sail {#} tiles a turn, but warships can sink them.', '{#} askeri {#} altına gemilere bindir. Denizde sırada {#} kare giderler ama savaş gemileri onları batırabilir.'],
    ['Aboard ships', 'Gemide'], ['Soldiers at sea barely fight back. Sail a warship onto them to sink them.', 'Denizdeki askerler pek karşılık veremez. Batırmak için üstlerine savaş gemisi sür.'],
    ['Ships carry an army farther than it can march.', 'Gemiler orduyu yürüyebileceğinden daha uzağa taşır.'],
    ['Click the sea to sail · a gold-outlined shore to land. Landing ends this army&#39;s turn and claims the tile.', 'Yelken açmak için denize · çıkarma için altın çizgili kıyıya tıkla. Çıkarma bu ordunun sırasını bitirir ve kareyi alır.'],
    ["Click the sea to sail · a gold-outlined shore to land. Landing ends this army's turn and claims the tile.", 'Yelken açmak için denize · çıkarma için altın çizgili kıyıya tıkla. Çıkarma bu ordunun sırasını bitirir ve kareyi alır.'],
    ['No moves left this turn.', 'Bu sıra için hamle kalmadı.'], ['Enemy warships can reach these ships. Soldiers at sea barely fight back.', 'Düşman savaş gemileri bu gemilere ulaşabilir. Denizdeki askerler pek karşılık veremez.'],
    ['Fleet · {#} warships', 'Filo · {#} savaş gemisi'], ['Fleet · {#} warship', 'Filo · {#} savaş gemisi'], ['{x} · {#} warships', '{x} · {#} savaş gemisi'], ['{x} · {#} warship', '{x} · {#} savaş gemisi'],
    ['At sea', 'Denizde'], ['Sail one of your fleets onto it to attack.', 'Saldırmak için filolarından birini üstüne sür.'],
    ['Ships sailing', 'Yola çıkan gemi'], ['At least one ship sails.', 'En az bir gemi gider.'], ['Keep one more ship here', 'Bir gemi daha burada kalsın'], ['The whole fleet is sailing.', 'Bütün filo yola çıkıyor.'], ['Send one more ship', 'Bir gemi daha gönder'],
    ['Sail with the whole fleet', 'Bütün filoyla git'], ['Send a single ship', 'Tek gemi gönder'],
    ['Send part of the fleet; the rest stay here as their own fleet. Small fleets (up to {#} ships) can sail up rivers.', 'Filonun bir kısmını gönder; kalanlar burada ayrı bir filo olur. Küçük filolar (en çok {#} gemi) nehirlerden yukarı çıkabilir.'],
    ['Click a sea tile or river to sail · an enemy ship to attack · a red-marked army on the shore to bombard.', 'Yelken açmak için deniz ya da nehir karesine · saldırmak için düşman gemisine · topa tutmak için kıyıdaki kırmızı işaretli orduya tıkla.'],
    ['Done for this turn.', 'Bu sıra bitti.'], ['Bombard', 'Topa tut'], ['Market', 'Pazar'], ['{#} soldiers', '{#} asker'],
    ['Holding {x}. It pays while the sea route home is open.', '{x} elinde. Eve deniz yolu açık oldukça kazandırır.'],
    // ---------------------------------------------------------------- towns
    ['Rebel town', 'Asi kasabası'], ['Your capital', 'Başkentin'], ['Your town', 'Kasaban'],
    ['Walls', 'Surlar'], ['Defense', 'Savunma'], ['What an attacker must beat before dice.', 'Saldıranın zarlardan önce yenmesi gereken güç.'],
    ['Defenders ×{x}. Archers on walls fight twice as hard.', 'Savunanlar ×{x}. Surlardaki okçular iki kat güçlü savaşır.'],
    ['No garrison', 'Garnizon yok'], ['{x} + {#} militia', '{x} + {#} milis'],
    ['In training · ready next turn', 'Eğitimde · sonraki sırada hazır'],
    ['Recruits train for a turn. They join the garrison, ready to march, at the start of your next turn. If the town falls first, they are lost.', 'Askerler bir sıra eğitim görür. Sonraki sıranın başında garnizona katılır ve yürümeye hazır olurlar. Kasaba önce düşerse kaybolurlar.'],
    ['Cancel one and get {#} gold back', 'Birini iptal et, {#} altın geri al'], ['Cancel all {#} and get {#} gold back', '{#} tanesini iptal et, {#} altın geri al'], ['Cancel all', 'Hepsini iptal et'],
    ['Command the garrison', 'Garnizona komut ver'], ['Recruit', 'Asker topla'], ['Build', 'İnşa et'],
    ['{#} of {#} recruits left this turn', 'bu sıra {#}/{#} asker alma hakkı kaldı'],
    ['Train 1 for {#} gold, ready next turn', '{#} altına 1 tane yetiştir, sonraki sırada hazır'], ['Train {#} for {#} gold, ready next turn', '{#} tanesini {#} altına yetiştir, sonraki sırada hazır'],
    ['Warship', 'Savaş gemisi'], ['Warships', 'Savaş gemileri'],
    ['Warships fight at sea, hold distant markets, block trade routes and bombard armies on the shore. Attack {x} · defense {x} · upkeep {x}.', 'Savaş gemileri denizde savaşır, uzak pazarları tutar, ticaret yollarını keser ve kıyıdaki orduları topa tutar. Saldırı {x} · savunma {x} · bakım {x}.'],
    ['Warships fight at sea, hold trading posts, block routes and bombard the shore. Attack {x} · defense {x} · upkeep {x}.', 'Savaş gemileri denizde savaşır, ticaret limanlarını tutar, yolları keser ve kıyıyı topa tutar. Saldırı {x} · savunma {x} · bakım {x}.'],
    ['Build a warship for {#} gold, at sea next turn', '{#} altına savaş gemisi yap, sonraki sırada denizde'],
    ['Level {#}: defenders ×{x}, +2 recruits a turn', 'Seviye {#}: savunanlar ×{x}, sırada +2 asker'],
    ['Level {#}: +{#} gold every turn, and +{#} on each of your trade agreements (up to +{#} each)', 'Seviye {#}: her sıra +{#} altın, ayrıca her ticaret anlaşmana +{#} (her biri en çok +{#})'],
    ['Harbor', 'Liman'], ['Launch warships; armies board ships here; home port for trade', 'Savaş gemisi yapılır; ordular burada gemiye biner; ticaretin ana limanıdır'],
    ['Barracks', 'Kışla'], ['Train swordsmen here', 'Burada kılıççı yetiştirilir'], ['Stables', 'Ahır'], ['Train knights here', 'Burada şövalye yetiştirilir'],
    ['Foundry', 'Dökümhane'], ['Cast cannons here', 'Burada top dökülür'], ['Harbor built.', 'Liman yapıldı.'], ['Only coastal cities can build a harbor.', 'Liman yalnızca kıyı kasabalarına yapılır.'],
    ['Your land', 'Senin toprağın'], ['Unclaimed', 'Sahipsiz'], ['Open water', 'Açık deniz'], ['Impassable', 'Geçilmez'], ['gold deposit', 'altın yatağı'],
    ['Step cost', 'Adım bedeli'], ['Outside your land. Your own land always costs 1.', 'Kendi toprağın dışında. Kendi toprağın her zaman 1 adımdır.'],
    ['Command this army', 'Bu orduya komut ver'], ['Build here', 'Buraya inşa et'],
    ['Farm', 'Çiftlik'], ['Gold mine', 'Altın madeni'], ['Outpost', 'Karakol'], ['Castle', 'Kale'], ['Port', 'İskele'],
    ['+{#} gold a turn. {#} of {#} farms allowed (1 per {#} land).', 'Sırada +{#} altın. {#}/{#} çiftlik hakkı (her {#} toprağa 1).'],
    ['+{#} gold a turn.', 'Sırada +{#} altın.'],
    ['Enemies on the 6 tiles around it may only attack it or turn back. {#} militia, soldiers here fight ×{x}. Upkeep {#}.', 'Çevresindeki 6 karedeki düşman yalnızca ona saldırabilir ya da geri döner. {#} milis; buradaki askerler ×{x} güçlü savaşır. Bakım {#}.'],
    ['A new town: +{#} gold a turn, recruits, walls, +1 marching order.', 'Yeni bir kasaba: sırada +{#} altın, asker, surlar, +1 yürüyüş emri.'],
    ['A harbor on the coast without a town: build warships here, board armies onto ships here, and bring sea trade home. Upkeep {#}.', 'Kasabasız bir kıyı limanı: burada savaş gemisi yapılır, ordular gemiye biner ve deniz ticareti eve getirilir. Bakım {#}.'],
    ['Warships are built here, armies standing here can board ships, and sea trade can come home here.', 'Burada savaş gemisi yapılır, buradaki ordular gemiye binebilir ve deniz ticareti buraya gelebilir.'],
    ['{#} warships on the slipway · ready next turn', 'kızakta {#} savaş gemisi · sonraki sırada hazır'], ['{#} warship on the slipway · ready next turn', 'kızakta {#} savaş gemisi · sonraki sırada hazır'],
    ['farm +{#}', 'çiftlik +{#}'], ['mine +{#}', 'maden +{#}'], ['outpost', 'karakol'], ['port', 'iskele'], ['river', 'nehir'],
    ['Not available right now.', 'Şu anda yapılamaz.'],
    // ---------------------------------------------------------------- hints
    ['In training: they join the garrison at the start of your next turn.', 'Eğitimde: sonraki sıranın başında garnizona katılacaklar.'],
    ['Cancelled: {#} gold back in the treasury.', 'İptal edildi: {#} altın hazineye döndü.'], ['Cancelled: {#} gold back.', 'İptal edildi: {#} altın geri geldi.'],
    ['The shipwrights are at work: the warship puts to sea at the start of your next turn.', 'Gemi ustaları iş başında: savaş gemisi sonraki sıranın başında denize iner.'],
    ['Armies cannot march on water. In a town with a harbor they can board ships.', 'Ordular suda yürüyemez. Limanlı bir kasabada gemiye binebilirler.'],
    ['Mountains cannot be crossed.', 'Dağlar aşılamaz.'], ['This army has no steps left this turn.', 'Bu ordunun bu sıra için adımı kalmadı.'],
    ['You are at peace with {x} until round {#}. You cannot march into their land.', '{2}. tura kadar {1} ile barıştasın. Onların toprağına yürüyemezsin.'],
    ['Too far: this army has {#} steps left this turn.', 'Çok uzak: bu ordunun bu sıra {#} adımı kaldı.'], ['Too far: this army has {#} step left this turn.', 'Çok uzak: bu ordunun bu sıra {#} adımı kaldı.'],
    ['Choose who marches first.', 'Önce kimin yürüyeceğini seç.'],
    ['This force can seize {#} more tiles this turn (it already took {#}).', 'Bu kuvvet bu sıra {#} kare daha alabilir (zaten {#} aldı).'], ['This force can seize {#} more tile this turn (it already took {#}).', 'Bu kuvvet bu sıra {#} kare daha alabilir (zaten {#} aldı).'],
    ['This force can seize {#} tiles. Send more soldiers to seize more.', 'Bu kuvvet {#} kare alabilir. Daha fazlası için daha çok asker gönder.'], ['This force can seize {#} tile. Send more soldiers to seize more.', 'Bu kuvvet {#} kare alabilir. Daha fazlası için daha çok asker gönder.'],
    ['No marching orders left this turn. Moving inside your own land is still free.', 'Bu sıra yürüyüş emri kalmadı. Kendi toprağında yürümek yine de serbest.'],
    ['This army has {x}. Click its banner to march again.', 'Bu ordunun {x}. Yine yürümek için sancağına tıkla.'],
    ['No army has steps left this turn.', 'Bu sıra hiçbir ordunun adımı kalmadı.'],
    ['Claimed {#} tiles.', '{#} kare alındı.'], ['Claimed {#} tile.', '{#} kare alındı.'],
    ['A warship is launched. It can sail next turn.', 'Savaş gemisi indirildi. Sonraki sırada yelken açabilir.'],
    ['Your fleet holds {x}: +{#} gold a turn while the route home stays open.', 'Filon {x} limanını tutuyor: eve yol açık kaldıkça sırada +{#} altın.'],
    ['{#} ships sailed off; {#} stay here, still selected.', '{#} gemi yola çıktı; {#} gemi burada kaldı ve hâlâ seçili.'], ['{#} ship sailed off; {#} stays here, still selected.', '{#} gemi yola çıktı; {#} gemi burada kaldı ve hâlâ seçili.'],
    ['{#} ships sailed off; {#} stays here, still selected.', '{#} gemi yola çıktı; {#} gemi burada kaldı ve hâlâ seçili.'], ['{#} ship sailed off; {#} stay here, still selected.', '{#} gemi yola çıktı; {#} gemi burada kaldı ve hâlâ seçili.'],
    ['Aboard for {#} gold. Click the sea to sail, or a gold-outlined shore to land.', '{#} altına gemiye bindiler. Yelken açmak için denize, çıkarma için altın çizgili kıyıya tıkla.'],
    ['Landed and claimed the shore. This army marches again next turn.', 'Çıkarma yapıldı ve kıyı alındı. Bu ordu sonraki sırada yine yürür.'], ['Landed. This army marches again next turn.', 'Çıkarma yapıldı. Bu ordu sonraki sırada yine yürür.'],
    ['{#} moves left at sea.', 'denizde {#} hamle kaldı.'], ['{#} move left at sea.', 'denizde {#} hamle kaldı.'],
    ['Bombardment: rolls {x} (need {#}+). {#} soldiers fell.', 'Topçu ateşi: zarlar {x} ({#}+ gerekli). {#} asker düştü.'], ['Bombardment: rolls {x} (need {#}+). {#} soldier fell.', 'Topçu ateşi: zarlar {x} ({#}+ gerekli). {#} asker düştü.'],
    ['Time is up. Your turn has ended.', 'Süre doldu. Sıran bitti.'],
    ['Warships stay on the water, or sail up rivers (at most {#} ships). Right-click a sea tile, a river, an enemy ship, or a red-marked army on the shore.', 'Savaş gemileri suda kalır ya da nehirlerden çıkar (en çok {#} gemi).'],
    // ---------------------------------------------------------------- hover lines
    ['Bombard {#} soldiers: each of your {#} ships kills one on {#}+ with 2d6. They cannot shoot back.', '{#} askeri topa tut: {#} geminin her biri 2d6 ile {#}+ atınca birini öldürür. Karşılık veremezler.'],
    ['Bombard {#} soldiers: each of your {#} ship kills one on {#}+ with 2d6. They cannot shoot back.', '{#} askeri topa tut: {#} geminin her biri 2d6 ile {#}+ atınca birini öldürür. Karşılık veremezler.'],
    ['Fall on {#} soldiers at sea: {x} chance to win. Most of them would drown.', 'Denizdeki {#} askere saldır: kazanma şansı {x}. Çoğu boğulur.'],
    ['Attack {#} enemy warships: {x} chance to win.', '{#} düşman savaş gemisine saldır: kazanma şansı {x}.'], ['Attack {#} enemy warship: {x} chance to win.', '{#} düşman savaş gemisine saldır: kazanma şansı {x}.'],
    ['Sail here and join this fleet ({#} moves).', 'Buraya git ve bu filoya katıl ({#} hamle).'],
    ['Sail to {x} ({#} moves). A fleet here earns +{#} gold a turn while its sea route home is open.', '{x} limanına git ({#} hamle). Buradaki filo, eve deniz yolu açık kaldıkça sırada +{#} altın kazandırır.'],
    ['Sail here ({#} moves).', 'Buraya git ({#} hamle).'], ['Sail here ({#} move).', 'Buraya git ({#} hamle).'], ['Enemy warships could reach you here.', 'Düşman savaş gemileri sana burada ulaşabilir.'],
    ['Your soldiers are aboard here.', 'Askerlerin burada gemide.'],
    ['Land here ({#} moves) and claim the tile. Landing ends this army&#39;s turn.', 'Buraya çıkarma yap ({#} hamle) ve kareyi al. Çıkarma bu ordunun sırasını bitirir.'],
    ['Land here ({#} move) and claim the tile. Landing ends this army&#39;s turn.', 'Buraya çıkarma yap ({#} hamle) ve kareyi al. Çıkarma bu ordunun sırasını bitirir.'],
    ['Land here ({#} moves). Landing ends this army&#39;s turn.', 'Buraya çıkarma yap ({#} hamle). Çıkarma bu ordunun sırasını bitirir.'], ['Land here ({#} move). Landing ends this army&#39;s turn.', 'Buraya çıkarma yap ({#} hamle). Çıkarma bu ordunun sırasını bitirir.'],
    ['Click to command this fleet ({#} moves, guns ready).', 'Bu filoya komut vermek için tıkla ({#} hamle, toplar hazır).'], ['Click to command this fleet ({#} moves).', 'Bu filoya komut vermek için tıkla ({#} hamle).'],
    ['{#} warships of {x}.', '{2} hanedanının {1} savaş gemisi.'], ['{#} warship of {x}.', '{2} hanedanının {1} savaş gemisi.'],
    ['Click to command this army instead. To join it, Alt-click it or drag your path onto it.', 'Bunun yerine bu orduya komut vermek için tıkla. Ona katılmak için Alt ile tıkla ya da yolunu üstüne sürükle.'],
    ['Your army stands here. Paint the tiles it should march to.', 'Ordun burada duruyor. Yürüyeceği kareleri boya.'],
    ['This painted tile cannot be reached.', 'Bu boyalı kareye ulaşılamaz.'], ['Click to erase it.', 'Silmek için tıkla.'], ['Click or drag to erase this tile.', 'Bu kareyi silmek için tıkla ya da sürükle.'],
    ['Battle here: {x} chance to win against {#} defenders at the outpost.', 'Burada savaş: karakoldaki {2} savunucuya karşı kazanma şansı {1}.'],
    ['Battle here: {x} chance to win against {#} defenders.', 'Burada savaş: {2} savunucuya karşı kazanma şansı {1}.'],
    ['Click to march into this town and join its garrison.', 'Bu kasabaya yürüyüp garnizona katılmak için tıkla.'],
    ['Paint here to march in and join this army ({#} soldiers).', 'Yürüyüp bu orduya katılmak için buraya boya ({#} asker).'],
    ['Enemy zone: your army may claim this tile and turn back, or go on to attack the town or outpost next to it. It cannot cut across or stop here.', 'Düşman bölgesi: ordun bu kareyi alıp geri dönebilir ya da yanındaki kasabaya veya karakola saldırmaya devam edebilir. Buradan geçemez ve burada duramaz.'],
    ['Paint to march through your land (free).', 'Kendi toprağında yürümek için boya (bedava).'], ['Paint to claim this tile.', 'Bu kareyi almak için boya.'],
    ['Click to give this army orders ({x}).', 'Bu orduya emir vermek için tıkla ({x}).'], ['This army is done for this turn.', 'Bu ordu bu sıra için işini bitirdi.'], ['Click for details.', 'Ayrıntılar için tıkla.'],
    ['Colonial land: no army can go there. Keep a warship at one of its trading posts to earn its gold.', 'Sömürge toprağı: hiçbir ordu oraya gidemez. Altınını kazanmak için ticaret limanlarından birinde savaş gemisi tut.'],
    ['Send a warship here to trade.', 'Ticaret için buraya savaş gemisi gönder.'], ['Click to recruit and improve this town.', 'Asker toplamak ve kasabayı geliştirmek için tıkla.'], ['Click to build here.', 'Buraya inşa etmek için tıkla.'],
    ['Rebels', 'Asiler'], ['walls {#}', 'surlar {#}'], ['Farm · +{#} gold', 'Çiftlik · +{#} altın'], ['Gold mine · +{#} gold', 'Altın madeni · +{#} altın'],
    ['Outpost · controls the 6 tiles around it', 'Karakol · çevresindeki 6 kareyi denetler'], ['Port · warships are built here and armies board ships here', 'İskele · burada savaş gemisi yapılır ve ordular gemiye biner'],
    ['{#} soldiers aboard ships: {x}', 'gemide {#} asker: {x}'], ['{#} soldiers: {x}', '{#} asker: {x}'],
    ['{x}: a trading post worth +{#} gold a turn to whoever docks a warship here. The gold sails home along the sea lanes.', '{x}: buraya savaş gemisi demirleyen, sırada +{#} altın kazanır. Altın deniz yollarından eve gider.'],
    ['Sea lane: a trade route. An enemy warship here cuts the trade that sails through.', 'Deniz yolu: bir ticaret yolu. Burada duran düşman savaş gemisi buradan geçen ticareti keser.'],
    ['Defenders ×{x}', 'Savunanlar ×{x}'],
    // ---------------------------------------------------------------- treasury and other tips
    ['{#} gold in the treasury', 'hazinede {#} altın'], ['Farms: {#}', 'Çiftlikler: {#}'], ['Gold mines: {#}', 'Altın madenleri: {#}'], ['Troops: {#} soldiers', 'Askerler: {#}'],
    ['Warships: {#} × {#}', 'Savaş gemileri: {#} × {#}'], ['Outposts: {#} × {#}', 'Karakollar: {#} × {#}'], ['Ports: {#} × {#}', 'İskeleler: {#} × {#}'], ['Ships for {#} soldiers at sea', 'Denizdeki {#} asker için gemiler'], ['Next turn', 'Sonraki sıra'],
    ['Market: {x}', 'Pazar: {x}'], ['Trade with {x} ({#} + {#} from markets)', '{x} ile ticaret ({#} + pazarlardan {#})'], ['Trade with {x}', '{x} ile ticaret'],
    ['(no harbor)', '(liman yok)'], ['(no route)', '(yol yok)'], ['(blocked by {x})', '({x} kesiyor)'],
    ['{#} of {#} marching orders left', '{#}/{#} yürüyüş emri kaldı'],
    ['Each march into land you don&#39;t hold uses one. Moving inside your own land is free. You get {#} + 1 per town you hold (max {#}).', 'Sahip olmadığın toprağa her yürüyüş bir emir harcar. Kendi toprağında yürümek bedava. {#} + elindeki her kasaba için 1 emir alırsın (en çok {#}).'],
    ["Each march into land you don't hold uses one. Moving inside your own land is free. You get {#} + 1 per town you hold (max {#}).", 'Sahip olmadığın toprağa her yürüyüş bir emir harcar. Kendi toprağında yürümek bedava. {#} + elindeki her kasaba için 1 emir alırsın (en çok {#}).'],
    ['{#} of {#} farms built', '{#}/{#} çiftlik kuruldu'],
    ['You may build 1 farm per {#} tiles you hold. You hold {#} tiles. Farms go on plains or by rivers and pay +{#} gold a turn (+{#} by a river).', 'Elindeki her {#} kareye 1 çiftlik kurabilirsin. {#} karen var. Çiftlikler ovaya ya da nehir kıyısına kurulur ve sırada +{#} altın getirir (nehir kıyısında +{#}).'],
    ['A force seizes 1 tile plus 1 for every 2 soldiers (knights count double), up to {#}. Tiles you already hold are free.', 'Bir kuvvet 1 kare, ayrıca her 2 asker için 1 kare alır (şövalyeler iki sayılır), en çok {#}. Zaten senin olan kareler bedava.'],
    ['Score {#}', 'Puan {#}'], ['Land {#} × {#}', 'Toprak {#} × {#}'], ['Farms {#} × {#}', 'Çiftlik {#} × {#}'], ['Mines {#} × {#}', 'Maden {#} × {#}'], ['Towns {#} × {#}', 'Kasaba {#} × {#}'],
    ['No round limit: play until one house remains.', 'Tur sınırı yok: tek hanedan kalana kadar oyna.'],
    ['This is the last round.', 'Bu son tur.'], ['When the last round ends, the highest score wins.', 'Son tur bitince en yüksek puan kazanır.'],
    ['<b>Your turn.</b> Recruit, build and march, then press End turn.', '<b>Sıra sende.</b> Asker topla, inşa et ve yürü, sonra Sırayı bitir’e bas.'],
    ['(computer) is moving.', '(bilgisayar) oynuyor.'],
    ['At peace until the end of round {#}', '{#}. turun sonuna kadar barış'], ['Trading', 'Ticaret var'], ['Deal', 'Anlaşma'],
    ['{#} towns · {#} land · {#} soldiers · {#} gold', '{#} kasaba · {#} toprak · {#} asker · {#} altın'], ['{#} town · {#} land · {#} soldiers · {#} gold', '{#} kasaba · {#} toprak · {#} asker · {#} altın'],
    // ---------------------------------------------------------------- battle reports
    ['Siege of {x}', '{x} kuşatması'], ['Battle of {x}', '{x} savaşı'], ['Attacker', 'Saldıran'], ['Defender', 'Savunan'], ['Town militia', 'Kasaba milisi'],
    ['Base strength', 'Temel güç'], ['Knights&#39; charge', 'Şövalye hücumu'], ["Knights' charge", 'Şövalye hücumu'], ['Swords vs spears', 'Kılıç mızrağa karşı'], ['Cannons vs walls', 'Top surlara karşı'],
    ['Luck ({#})', 'Şans ({#})'], ['Fighting strength', 'Savaş gücü'], ['Odds before battle {x}', 'Savaştan önceki şans {x}'], ['vs', 'vs'],
    ['The survivors fled to {x}.', 'Hayatta kalanlar {x} kasabasına kaçtı.'], ['The few survivors scattered.', 'Kalan birkaç kişi dağıldı.'], ['The defenders were wiped out.', 'Savunanlar yok edildi.'],
    ['{x} won. ', '{x} kazandı. '], ['The fighting cost {#} steps of marching.', 'Çarpışma {#} adım yürüyüşe mal oldu.'], ['The fighting cost {#} step of marching.', 'Çarpışma {#} adım yürüyüşe mal oldu.'],
    ['{x} held the line. The attackers fell back.', '{x} hattı tuttu. Saldıranlar geri çekildi.'],
    ['Campaign report', 'Sefer raporu'], ['Battle report', 'Savaş raporu'], ['Seized {#} tiles, including {x}.', '{2} dahil {1} kare alındı.'], ['Seized {#} tile, including {x}.', '{2} dahil {1} kare alındı.'],
    ['Seized {#} tiles.', '{#} kare alındı.'], ['Seized {#} tile.', '{#} kare alındı.'], ['No land was taken.', 'Toprak alınamadı.'], ['Survivors marched back to where they started.', 'Hayatta kalanlar başladıkları yere geri döndü.'],
    ['River crossing', 'Nehir geçişi'], ['Landing from ships', 'Gemiden çıkarma'], ['Walls level {#}', 'Sur seviyesi {#}'], ['Town palisade', 'Kasaba çiti'], ['Palisade', 'Çit'],
    ['Sea battle', 'Deniz savaşı'], ['Battle at sea', 'Denizde savaş'], ['Soldiers aboard', 'Gemideki askerler'],
    ['Your warships fell on the transports: {#} soldiers drowned and none survived.', 'Savaş gemilerin nakliye gemilerine saldırdı: {#} asker boğuldu, kurtulan olmadı.'],
    ['Your warships fell on the transports: {#} soldiers drowned.', 'Savaş gemilerin nakliye gemilerine saldırdı: {#} asker boğuldu.'],
    ['The soldiers fought your ships off.', 'Askerler gemilerini püskürttü.'], ['Your fleet won the sea. The survivors fled to their home harbor.', 'Filon denizi kazandı. Kalanlar kendi limanlarına kaçtı.'],
    ['Your fleet won the sea. The enemy ships went down.', 'Filon denizi kazandı. Düşman gemileri battı.'], ['The enemy fleet held. Your ships went down.', 'Düşman filosu dayandı. Gemilerin battı.'], ['The enemy fleet held. Yours fell back.', 'Düşman filosu dayandı. Seninkiler geri çekildi.'],
    ['{x}, your turn', '{x}, sıra sende'], ['Since your last turn', 'Son sırandan beri'],
    ['Round {#} of {#}. You have {#} gold ({x} this turn) and {#} marching orders.', 'Tur {#}/{#}. {#} altının var (bu sıra {x}) ve {#} yürüyüş emrin var.'],
    ['Round {#}. You have {#} gold ({x} this turn) and {#} marching orders.', 'Tur {#}. {#} altının var (bu sıra {x}) ve {#} yürüyüş emrin var.'],
    ['{x} conquers the realm', '{x} diyarı fethetti'], ['{x} holds the greatest realm', '{x} en büyük diyara sahip'], ['Every rival house has fallen.', 'Bütün rakip hanedanlar düştü.'],
    ['The chronicle closes after round {#}.', 'Vakayiname {#}. turdan sonra kapandı.'], ['Score: 1 per land tile, {#} per farm, {#} per mine, {#} per town.', 'Puan: her toprak karesine 1, çiftliğe {#}, madene {#}, kasabaya {#}.'],
    ['fallen', 'düştü'], ['House', 'Hanedan'], ['Score', 'Puan'], ['Towns', 'Kasabalar'], ['Mines', 'Madenler'], ['Battles won', 'Kazanılan savaş'], ['Income', 'Gelir'], ['Soldiers', 'Asker'], ['Knights', 'Şövalyeler'], ['Cannons', 'Toplar'],
    ['The houses compared', 'Hanedanların karşılaştırması'], ['Click a column to sort.', 'Sıralamak için bir sütuna tıkla.'],
    // ---------------------------------------------------------------- inspect card
    ['capital', 'başkent'], ['Buildings', 'Yapılar'], ['none', 'yok'], ['Militia', 'Milis'], ['Defense strength', 'Savunma gücü'], ['level {#} (×{x})', 'seviye {#} (×{x})'], ['level {#}', 'seviye {#}'],
    ['Garrison of {x} · {#}', '{x} garnizonu · {#}'], ['Aboard ships: army of {x} · {#}', 'Gemide: {x} ordusu · {#}'], ['Army of {x} · {#}', '{x} ordusu · {#}'],
    ['Sea moves left', 'Kalan deniz hamlesi'], ['Steps left', 'Kalan adım'], ['Fleet of {x}', '{x} filosu'], ['Water', 'Su'], ['Colonial land, reached only by ship', 'Sömürge toprağı, yalnızca gemiyle ulaşılır'],
    ['A distant market: +{#} gold a turn to the house whose warship holds it, while the sea route home stays open.', 'Uzak bir pazar: savaş gemisi burayı tutan hanedana, eve deniz yolu açık kaldıkça sırada +{#} altın.'],
    ['Defenders here ×{x}', 'Buradaki savunanlar ×{x}'],
    // ---------------------------------------------------------------- diplomacy
    ['Deal with {x}', '{x} ile anlaşma'], ['At peace until the end of round {#}.', '{#}. turun sonuna kadar barış.'], ['At war: either side may attack the other.', 'Savaş hâli: iki taraf da birbirine saldırabilir.'],
    ['They pay you {#} gold a turn ({#} more).', 'Sana sırada {#} altın ödüyorlar ({#} kez daha).'], ['You pay them {#} gold a turn ({#} more).', 'Onlara sırada {#} altın ödüyorsun ({#} kez daha).'],
    ['They hold {#} gold, you hold {#}.', 'Onların {#} altını, senin {#} altının var.'], ['You give', 'Sen verirsin'], ['You ask for', 'Sen istersin'], ['Gold now', 'Şimdi altın'], ['Gold each turn, for {#} turns', 'Her sıra altın, {#} sıra boyunca'],
    ['You already trade with them.', 'Onlarla zaten ticaret yapıyorsun.'],
    ['Trade agreement: both houses earn gold every turn along a caravan or sea route between your towns, while at peace. An enemy army or ship on the route blocks it.', 'Ticaret anlaşması: barış sürdükçe iki hanedan da kasabaların arasındaki kervan ya da deniz yolundan her sıra altın kazanır. Yoldaki düşman ordusu ya da gemisi onu keser.'],
    ['Extend the peace for {#} rounds: neither side may march into the other&#39;s land, and their zones stop hindering you.', 'Barışı {#} tur uzat: iki taraf da birbirinin toprağına yürüyemez ve bölgeleri seni engellemez.'],
    ['Make peace for {#} rounds: neither side may march into the other&#39;s land, and their zones stop hindering you.', '{#} tur barış yap: iki taraf da birbirinin toprağına yürüyemez ve bölgeleri seni engellemez.'],
    ["Extend the peace for {#} rounds: neither side may march into the other's land, and their zones stop hindering you.", 'Barışı {#} tur uzat: iki taraf da birbirinin toprağına yürüyemez ve bölgeleri seni engellemez.'],
    ["Make peace for {#} rounds: neither side may march into the other's land, and their zones stop hindering you.", '{#} tur barış yap: iki taraf da birbirinin toprağına yürüyemez ve bölgeleri seni engellemez.'],
    ['Computer houses answer at once.', 'Bilgisayar hanedanları hemen cevap verir.'], ['{x} will answer at the start of their turn.', '{x} kendi sırasının başında cevap verecek.'], ['An unanswered offer lapses after a round.', 'Cevapsız teklif bir tur sonra düşer.'],
    ['Send offer', 'Teklifi gönder'], ['Accept', 'Kabul et'], ['Decline', 'Reddet'], ['Offer from {x}', '{x} hanedanından teklif'],
    ['Peace would last until the end of round {#}; neither side could march into the other&#39;s land.', 'Barış {#}. turun sonuna kadar sürer; iki taraf da birbirinin toprağına yürüyemez.'],
    ["Peace would last until the end of round {#}; neither side could march into the other's land.", 'Barış {#}. turun sonuna kadar sürer; iki taraf da birbirinin toprağına yürüyemez.'],
    ['{x} accepted.', '{x} kabul etti.'], ['{x} declined.', '{x} reddetti.'],
    ['{#} offers waiting', '{#} teklif bekliyor'], ['{#} offer waiting', '{#} teklif bekliyor'],
    // ---------------------------------------------------------------- start screen
    ['Paint the borders you want, then fight for them. Turn-based conquest for 2 to 8 rulers around one screen, against the computer, or online.', 'İstediğin sınırları boya, sonra onlar için savaş. 2–8 hükümdar için sıra tabanlı fetih: aynı ekranda, bilgisayara karşı ya da çevrim içi.'],
    ['Houses', 'Hanedanlar'], ['The realm', 'Diyar'], ['Map', 'Harita'], ['Map size', 'Harita boyutu'], ['Length', 'Süre'], ['Turn timer', 'Sıra süresi'], ['Map seed (optional)', 'Harita tohumu (isteğe bağlı)'],
    ['Random realm: a new land every game', 'Rastgele diyar: her oyunda yeni bir toprak'], ['Known World: Europe and the Mediterranean', 'Bilinen Dünya: Avrupa ve Akdeniz'], ['Random realm', 'Rastgele diyar'], ['Known World', 'Bilinen Dünya'],
    ['Small: close quarters', 'Küçük: dar alan'], ['Large: a wide world to explore', 'Büyük: keşfedilecek geniş bir dünya'], ['Small', 'Küçük'], ['Large', 'Büyük'],
    ['{#} rounds', '{#} tur'], ['Until one house remains', 'Tek hanedan kalana kadar'], ['Off', 'Kapalı'], ['{#} seconds', '{#} saniye'], ['{#} minutes', '{#} dakika'], ['Random', 'Rastgele'],
    ['Human', 'İnsan'], ['Add a house', 'Hanedan ekle'], ['Learn to play · 5 min', 'Oynamayı öğren · 5 dk'], ['Start game', 'Oyunu başlat'], ['Continue saved game · Round {#}, {#} houses', 'Kayıtlı oyuna devam · Tur {#}, {#} hanedan'],
    ['About {#} minutes for {#} humans at a brisk pace.', 'Hızlı oynanırsa {2} insan için yaklaşık {1} dakika.'], ['About {#} minutes for {#} human at a brisk pace.', 'Hızlı oynanırsa {2} insan için yaklaşık {1} dakika.'],
    ['No round limit: play until one house remains.', 'Tur sınırı yok: tek hanedan kalana kadar oyna.'],
    ['Draw a flag for this house', 'Bu hanedan için bayrak çiz'], ['Redraw this flag', 'Bu bayrağı yeniden çiz'],
    ['Play online with friends', 'Arkadaşlarla çevrim içi oyna'],
    ['No accounts needed. Host a game, set it up in the lobby and send your friends the link. Their browsers connect straight to yours, so keep your tab open while you play.', 'Hesap gerekmez. Bir oyun aç, lobide ayarla ve arkadaşlarına bağlantıyı gönder. Tarayıcıları doğrudan seninkine bağlanır; oynarken sekmeni açık tut.'],
    ['Host an online game', 'Çevrim içi oyun aç'], ['Resume hosting {x}', '{x} oyununu sürdür'], ['Rejoin {x}', '{x} oyununa geri dön'], ['Have a room code?', 'Oda kodun var mı?'], ['Join', 'Katıl'],
    ['Room codes have 5 letters and digits.', 'Oda kodları 5 harf ve rakamdan oluşur.'],
    // ---------------------------------------------------------------- flags
    ['Draw your flag', 'Bayrağını çiz'], ['Paint it cell by cell. It flies over your towns and on every army&#39;s banner.', 'Kare kare boya. Kasabalarının üstünde ve her ordunun sancağında dalgalanır.'],
    ["Paint it cell by cell. It flies over your towns and on every army's banner.", 'Kare kare boya. Kasabalarının üstünde ve her ordunun sancağında dalgalanır.'],
    ['Brush', 'Fırça'], ['Fill', 'Doldur'], ['Start from a pattern (in the colour you picked):', 'Bir desenle başla (seçtiğin renkle):'],
    ['Plain', 'Düz'], ['Cross', 'Haç'], ['Nordic', 'İskandinav'], ['Saltire', 'Çapraz'], ['Quarters', 'Dörtlü'], ['Stripes', 'Çizgili'], ['Pale', 'Dikey şerit'], ['Chevron', 'Ok başı'], ['Border', 'Kenar'],
    ['No flag, just my colour', 'Bayrak yok, yalnızca rengim'], ['Use this flag', 'Bu bayrağı kullan'],
    ['House colour', 'Hanedan rengi'], ['Black', 'Siyah'], ['Parchment', 'Parşömen'], ['Red', 'Kırmızı'], ['Blue', 'Mavi'], ['Green', 'Yeşil'], ['Purple', 'Mor'],
    // ---------------------------------------------------------------- online lobby
    ['Join a game of Kurultay', 'Bir Kurultay oyununa katıl'], ['Room', 'Oda'], ['Choose the name of your house; you can change it in the lobby.', 'Hanedanının adını seç; lobide değiştirebilirsin.'],
    ['Your name', 'Adın'],  ['Join the lobby', 'Lobiye katıl'], ['Type a name first.', 'Önce bir ad yaz.'],
    ['Game lobby', 'Oyun lobisi'], ['Game lobby · ', 'Oyun lobisi · '], ['Opening a lobby', 'Lobi açılıyor'], ['Joining {x}', '{x} oyununa katılınıyor'], ['Connecting…', 'Bağlanıyor…'],
    ['Send this link to your friends. They type a name and appear here; start when everyone is ready.', 'Bu bağlantıyı arkadaşlarına gönder. Adlarını yazıp burada görünürler; herkes hazır olunca başlat.'],
    ['Copy link', 'Bağlantıyı kopyala'], ['Copied', 'Kopyalandı'], ['Host', 'Kurucu'], ['Ready ✓', 'Hazır ✓'], ['Not ready', 'Hazır değil'], ['Ready', 'Hazır'], ['Open seat', 'Boş yer'], ['Offline', 'Bağlı değil'], ['Computer', 'Bilgisayar'], ['Friend', 'Arkadaş'],
    ['Pick your colour and flag, then press <b>Ready</b>.', 'Rengini ve bayrağını seç, sonra <b>Hazır</b>’a bas.'], ['You are ready. Waiting for the host to start.', 'Hazırsın. Kurucunun başlatması bekleniyor.'],
    ['The lobby is full: you can watch the game.', 'Lobi dolu: oyunu izleyebilirsin.'],
    ['Waiting for {x} to be ready.', '{x} hazır olsun diye bekleniyor.'], ['{#} open seats will be played by the computer.', '{#} boş yeri bilgisayar oynayacak.'], ['{#} open seat will be played by the computer.', '{#} boş yeri bilgisayar oynayacak.'],
    ['Everyone is ready.', 'Herkes hazır.'], ['{#} of {#} human seats taken.', '{#}/{#} insan yeri dolu.'], ['Close the lobby', 'Lobiyi kapat'], ['Leave', 'Ayrıl'],
    ['Could not open the lobby', 'Lobi açılamadı'], ['Could not connect', 'Bağlanılamadı'], ['No game at {x}', '{x} kodunda oyun yok'], ['Back', 'Geri'],
    ['Check the link, and make sure the host still has the lobby open.', 'Bağlantıyı kontrol et ve kurucunun lobiyi hâlâ açık tuttuğundan emin ol.'],
    ['The connection service did not answer. Check your internet connection and try again.', 'Bağlantı hizmeti cevap vermedi. İnternet bağlantını kontrol edip yeniden dene.'],
    ['That room is still open in another tab or browser. Close it, wait a few seconds, then try again.', 'Bu oda başka bir sekmede ya da tarayıcıda hâlâ açık. Kapat, birkaç saniye bekle ve yeniden dene.'],
    ['The host closed the lobby', 'Kurucu lobiyi kapattı'], ['Ask them for a new link.', 'Yeni bir bağlantı iste.'],
    ['Online game {x}. The map updates as soon as they move.', 'Çevrim içi oyun {x}. Harita onlar oynadıkça güncellenir.'], ['Lost the host. Reconnecting…', 'Kurucuyla bağlantı koptu. Yeniden bağlanılıyor…'],
    ['Skip this turn', 'Bu sırayı atla'], ['As host you can skip a turn that is taking too long.', 'Kurucu olarak çok uzayan bir sırayı atlayabilirsin.'], ['{x} is offline.', '{x} bağlı değil.'],
    ['Reopening your game…', 'Oyunun yeniden açılıyor…'], ['Could not reopen the room. Try again in a few seconds.', 'Oda yeniden açılamadı. Birkaç saniye sonra tekrar dene.'],
    ['Mark at least one house as Human to play online.', 'Çevrim içi oynamak için en az bir hanedanı İnsan yap.'],
    // ---------------------------------------------------------------- tutorial
    ['Exit tutorial', 'Öğreticiden çık'], ['Skip this step', 'Bu adımı atla'], ['Show me', 'Göster'], ['Finish', 'Bitir'],
    ['Welcome to your realm', 'Diyarına hoş geldin'],
    ['You are <b>House Varn</b>, in red. The castle with the gold crown is your capital, and everything inside the red border is your land. Every turn you <b>claim land</b>, <b>build</b>, <b>recruit</b> and <b>fight</b>. This short game walks you through all four.', 'Sen kırmızı renkli <b>House Varn</b> hanedanısın. Altın taçlı kale başkentin, kırmızı sınırın içindeki her yer senin toprağın. Her sıra <b>toprak alır</b>, <b>inşa eder</b>, <b>asker toplar</b> ve <b>savaşırsın</b>. Bu kısa oyun dördünü de gösterir.'],
    ['Pick up your army', 'Ordunu seç'],
    ['Click the <b>red banner</b> on your castle. The number on it is how many soldiers stand there. (Clicking the castle and then <b>Command the garrison</b> works too.)', 'Kalendeki <b>kırmızı sancağa</b> tıkla. Üstündeki sayı orada kaç asker olduğunu gösterir. (Kaleye tıklayıp <b>Garnizona komut ver</b>’e basmak da olur.)'],
    ['Paint the land you want', 'İstediğin toprağı boya'],
    ['Now <b>click or drag across the gold outline</b>, just outside your border, on the road toward Dragonmere. Painted tiles get a hatch, and the flag marks where your army will stop. Darkened tiles are too far to reach this turn. Forests, hills and rivers slow an army down, so it only gets this far today.', 'Şimdi sınırının hemen dışında, Dragonmere yolundaki <b>altın çizginin üstüne tıkla ya da sürükle</b>. Boyanan kareler taranır, bayrak ordunun duracağı yeri gösterir. Kararan kareler bu sıra için çok uzak. Orman, tepe ve nehirler orduyu yavaşlatır; bugün ancak buraya kadar gider.'],
    ['March!', 'Yürü!'],
    ['The panel on the right shows how many tiles this army can seize (more soldiers, more land) and that this march uses one of your <b>marching orders</b>. Press <b>March and claim</b>, or hit Enter.', 'Sağdaki panel bu ordunun kaç kare alabileceğini (daha çok asker, daha çok toprak) ve bu yürüyüşün bir <b>yürüyüş emri</b> harcadığını gösterir. <b>Yürü ve al</b>’a bas ya da Enter’a bas.'],
    ['Build a farm', 'Çiftlik kur'],
    ['Farms pay gold every turn. Click the <b>green plains tile</b> outlined in gold inside your border, then press <b>Build</b> next to Farm. You may build 1 farm per 5 tiles you hold, so more land means more farms.', 'Çiftlikler her sıra altın getirir. Sınırının içinde altın çizgiyle işaretli <b>yeşil ova karesine</b> tıkla, sonra Çiftlik’in yanındaki <b>İnşa et</b>’e bas. Her 5 kareye 1 çiftlik kurabilirsin; toprak çoğaldıkça çiftlik de çoğalır.'],
    ['Farms pay gold every turn. Click the <b>green plains tile</b> outlined in gold inside your border, then press <b>Build</b> next to Farm. You may build 1 farm per 5 tiles you hold, so more land means more farms. It is finished at the start of your next turn.', 'Çiftlikler her sıra altın getirir. Sınırının içinde altın çizgiyle işaretli <b>yeşil ova karesine</b> tıkla, sonra Çiftlik’in yanındaki <b>İnşa et</b>’e bas. Her 5 kareye 1 çiftlik kurabilirsin; toprak çoğaldıkça çiftlik de çoğalır. Sonraki sıranın başında biter.'],
    ['Recruit soldiers', 'Asker topla'],
    ['Click your <b>castle</b>, then press <b>+5</b> next to Spearmen. Soldiers cost gold now and a little upkeep every turn. They train for a turn and join your garrison at the start of your next turn.', '<b>Kalene</b> tıkla, sonra Mızrakçılar’ın yanındaki <b>+5</b>’e bas. Askerler şimdi altına, her sıra da biraz bakıma mal olur. Bir sıra eğitim görür ve sonraki sıranın başında garnizonuna katılırlar.'],
    ['End your turn', 'Sıranı bitir'],
    ['Press <b>End turn</b> at the top right. Your rival, House Aldane, moves somewhere far away. Then you collect gold from your castle and farms, and get fresh marching orders.', 'Sağ üstteki <b>Sırayı bitir</b>’e bas. Rakibin House Aldane uzaklarda bir yerde oynar. Sonra kalenden ve çiftliklerinden altın toplar, yeni yürüyüş emirleri alırsın.'],
    ['Take Dragonmere', 'Dragonmere’i al'],
    ['The grey castle outlined in gold is <b>Dragonmere</b>, held by rebels. Towns give gold, recruits and an extra marching order. Click your army at the ford, then <b>paint a path that ends on the town</b>. The swords marker shows your chance to win. The town sits on a hill behind a river, which helps its defenders, so check the odds before you attack. Green is good; red means bring more soldiers first.', 'Altın çizgili gri kale <b>Dragonmere</b>; asilerin elinde. Kasabalar altın, asker ve fazladan bir yürüyüş emri verir. Geçitteki ordunu seç, sonra <b>kasabada biten bir yol boya</b>. Kılıç işareti kazanma şansını gösterir. Kasaba nehrin ardında bir tepede; bu savunanlara yarar, saldırmadan önce şansa bak. Yeşil iyi; kırmızı, önce daha çok asker getir demek.'],
    ['You know the basics', 'Temelleri öğrendin'], ['Victory! ', 'Zafer! '], ['Battles are numbers plus dice, and this one went against you. ', 'Savaşlar sayı artı zardır; bu sefer zar senden yana değildi. '],
    ['From here, keep the loop going: claim land, put farms on plains and <b>mines on gold deposits</b> (the gold diamonds), post soldiers on them as guards, and take towns. Each town&#39;s panel has walls, markets, harbors for ships, and stables for knights. Most points after round 10 wins. <b>Rules</b> at the top has the details.', 'Bundan sonra döngüyü sürdür: toprak al, ovalara çiftlik ve <b>altın yataklarına maden</b> (altın elmaslar) kur, onları korumak için asker koy ve kasabaları al. Her kasabanın panelinde surlar, pazarlar, gemiler için liman ve şövalyeler için ahır var. 10. turdan sonra en çok puanı olan kazanır. Ayrıntılar yukarıdaki <b>Kurallar</b>’da.'],
    ["From here, keep the loop going: claim land, put farms on plains and <b>mines on gold deposits</b> (the gold diamonds), post soldiers on them as guards, and take towns. Each town's panel has walls, markets, harbors for ships, and stables for knights. Most points after round 10 wins. <b>Rules</b> at the top has the details.", 'Bundan sonra döngüyü sürdür: toprak al, ovalara çiftlik ve <b>altın yataklarına maden</b> (altın elmaslar) kur, onları korumak için asker koy ve kasabaları al. Her kasabanın panelinde surlar, pazarlar, gemiler için liman ve şövalyeler için ahır var. 10. turdan sonra en çok puanı olan kazanır. Ayrıntılar yukarıdaki <b>Kurallar</b>’da.'],
    // ---------------------------------------------------------------- engine: reasons and errors
    ['It is not your turn.', 'Sıra sende değil.'], ['This army lost a battle this turn. It can march again next turn.', 'Bu ordu bu sıra bir savaş kaybetti. Sonraki sırada yine yürüyebilir.'],
    ['This army has no movement left this turn.', 'Bu ordunun bu sıra hareketi kalmadı.'], ['Send at least one soldier.', 'En az bir asker gönder.'], ['Paint the tiles you want to march through or conquer.', 'Yürüyeceğin ya da fethedeceğin kareleri boya.'],
    ['Too much land: this force can seize {#} more tiles this turn, you painted {#}.', 'Çok fazla toprak: bu kuvvet bu sıra {#} kare daha alabilir, sen {#} kare boyadın.'], ['Too much land: this force can seize {#} more tile this turn, you painted {#}.', 'Çok fazla toprak: bu kuvvet bu sıra {#} kare daha alabilir, sen {#} kare boyadın.'],
    ['An enemy town or outpost blocks the way: an army entering one of the 6 tiles around it may only attack it or turn back. Paint the town or outpost to attack it, or go around.', 'Bir düşman kasabası ya da karakolu yolu kesiyor: çevresindeki 6 kareye giren ordu yalnızca ona saldırabilir ya da geri döner. Saldırmak için kasabayı veya karakolu boya ya da etrafından dolaş.'],
    ['{#} painted tiles are beyond marching range.', '{#} boyalı kare yürüyüş menzilinin dışında.'], ['{#} painted tile is beyond marching range.', '{#} boyalı kare yürüyüş menzilinin dışında.'],
    ['Wait for your turn.', 'Sıranı bekle.'], ['You must control this land.', 'Bu toprak senin olmalı.'], ['Something is already built here.', 'Burada zaten bir yapı var.'], ['Save gold deposits for a mine.', 'Altın yataklarını maden için sakla.'],
    ['Farms need plains or a river.', 'Çiftlik için ova ya da nehir gerekir.'], ['Farm limit reached: 1 farm per {#} tiles you hold ({#} tiles allow {#}).', 'Çiftlik sınırı doldu: her {#} kareye 1 çiftlik ({#} kare {#} çiftliğe izin verir).'],
    ['Mines need a gold deposit.', 'Maden için altın yatağı gerekir.'], ['Too close to {x}. Castles must be {#}+ tiles apart.', '{x} çok yakın. Kaleler arasında en az {#} kare olmalı.'],
    ['{x} already guards this ground. Outposts must stand {#}+ tiles from towns.', 'Bu toprağı zaten {x} koruyor. Karakollar kasabalardan en az {#} kare uzakta olmalı.'],
    ['Too close to another outpost. Outposts must be {#}+ tiles apart.', 'Başka bir karakola çok yakın. Karakollar arasında en az {#} kare olmalı.'],
    ['A port must stand on the coast, next to the water.', 'İskele kıyıda, suyun yanında olmalı.'], ['Needs {#} gold.', '{#} altın gerekir.'], ['Not your city.', 'Senin kasaban değil.'], ['Not your town.', 'Senin kasaban değil.'],
    ['Build Stables here to train knights.', 'Şövalye yetiştirmek için buraya Ahır yap.'], ['Build Barracks here to train swordsmen.', 'Kılıççı yetiştirmek için buraya Kışla yap.'], ['Build a Foundry here to train cannons.', 'Top dökmek için buraya Dökümhane yap.'],
    ['Only {#} more recruits here this turn.', 'Bu sıra burada yalnızca {#} asker daha alınabilir.'], ['No more recruits here this turn.', 'Bu sıra burada başka asker alınamaz.'],
    ['Nothing of that kind is in training here.', 'Burada bu türden eğitimde kimse yok.'], ['Build a Harbor here to launch warships.', 'Savaş gemisi için buraya Liman yap.'],
    ['A harbor launches at most {#} warships a turn.', 'Bir liman sırada en çok {#} savaş gemisi indirir.'], ['Enemy ships blockade this harbor.', 'Düşman gemileri bu limanı abluka altında tutuyor.'],
    ['Not your port.', 'Senin iskelen değil.'], ['A port launches at most {#} warships a turn.', 'Bir iskele sırada en çok {#} savaş gemisi indirir.'], ['Enemy ships blockade this port.', 'Düşman gemileri bu iskeleyi abluka altında tutuyor.'], ['No warships are being built here.', 'Burada yapılan savaş gemisi yok.'],
    ['Too many ships for a river: at most {#} warships can sail up one.', 'Nehir için çok fazla gemi: bir nehirden en çok {#} savaş gemisi çıkabilir.'], ['Foreign troops or a foreign town hold that stretch of river.', 'Nehrin o kısmını yabancı askerler ya da yabancı bir kasaba tutuyor.'],
    ['Ships sail on water and rivers.', 'Gemiler suda ve nehirlerde gider.'], ['Too crowded: at most {#} warships fit on a river.', 'Çok kalabalık: bir nehre en çok {#} savaş gemisi sığar.'],
    ['This fleet has no moves left this turn.', 'Bu filonun bu sıra hamlesi kalmadı.'], ['Too far for this fleet this turn.', 'Bu filo için bu sıra çok uzak.'], ['Your own soldiers are aboard ships there.', 'Orada kendi askerlerin gemide.'],
    ['This fleet has already fired this turn.', 'Bu filo bu sıra zaten ateş etti.'], ['No enemy army in range of the guns there.', 'Orada topların menzilinde düşman ordusu yok.'],
    ['That army is gone.', 'O ordu artık yok.'], ['This army is already at sea.', 'Bu ordu zaten denizde.'], ['Armies board ships in one of your towns with a harbor, or at one of your ports.', 'Ordular limanlı bir kasabanda ya da iskelelerinden birinde gemiye biner.'],
    ['Choose who boards.', 'Kimin bineceğini seç.'], ['This army lost a battle this turn.', 'Bu ordu bu sıra bir savaş kaybetti.'], ['No free water beside the harbor: ships are in the way.', 'Limanın yanında boş su yok: gemiler yolu kapatıyor.'],
    ['Ships for {#} soldiers cost {#} gold.', '{#} asker için gemiler {#} altın tutar.'], ['Ships for {#} soldier cost {#} gold.', '{#} asker için gemiler {#} altın tutar.'],
    ['These ships have no moves left this turn.', 'Bu gemilerin bu sıra hamlesi kalmadı.'], ['Transports cannot attack warships.', 'Nakliye gemileri savaş gemilerine saldıramaz.'], ['Another ship is there.', 'Orada başka bir gemi var.'],
    ['Too far: these ships have {#} moves left.', 'Çok uzak: bu gemilerin {#} hamlesi kaldı.'], ['Too far: these ships have {#} move left.', 'Çok uzak: bu gemilerin {#} hamlesi kaldı.'],
    ['Too far to land there: these ships have {#} moves left.', 'Oraya çıkmak için çok uzak: bu gemilerin {#} hamlesi kaldı.'], ['Too far to land there: these ships have {#} move left.', 'Oraya çıkmak için çok uzak: bu gemilerin {#} hamlesi kaldı.'],
    ['Mountains: no place to land.', 'Dağlar: çıkacak yer yok.'], ['Land on a tile beside the water.', 'Suyun yanındaki bir kareye çık.'],
    ['A walled town cannot be stormed from the boats. Land beside it, then attack next turn.', 'Surlu bir kasabaya gemilerden saldırılamaz. Yanına çık, sonraki sırada saldır.'],
    ['Enemy soldiers hold that beach. Land beside them.', 'O kıyıyı düşman askerleri tutuyor. Yanlarına çık.'], ['An outpost guards that shore. Land beside it.', 'O kıyıyı bir karakol koruyor. Yanına çık.'], ['You are at peace with {x}.', '{x} ile barıştasın.'],
    ['Choose another house.', 'Başka bir hanedan seç.'], ['That house has fallen.', 'O hanedan düştü.'], ['Put something in the offer.', 'Teklife bir şey koy.'], ['Trade needs peace: add peace to the offer.', 'Ticaret için barış gerekir: teklife barışı ekle.'],
    ['That offer is no longer on the table.', 'Bu teklif artık geçerli değil.'], ['The game is over.', 'Oyun bitti.'],
    // ---------------------------------------------------------------- engine: chronicle
    ['A new age begins. {#} houses vie for the realm.', 'Yeni bir çağ başlıyor. {#} hanedan diyar için yarışıyor.'],
    ['{x} claimed {#} tiles of land.', '{x} {#} kare toprak aldı.'], ['{x} claimed {#} tile of land.', '{x} {#} kare toprak aldı.'],
    ['{x} seized {#} tiles in the campaign.', '{x} seferde {#} kare ele geçirdi.'], ['{x} seized {#} tile in the campaign.', '{x} seferde {#} kare ele geçirdi.'],
    ['{x} won the battle of {x} against {x} ({#}% odds). {#} attackers and {#} defenders fell.', '{x}, {x} savaşını {x} karşısında kazandı (şans %{#}). {#} saldıran ve {#} savunan düştü.'],
    ['{x} held {x} against {x} ({#}% odds for the attacker). {#} attackers and {#} defenders fell.', '{x}, {x} karesini {x} karşısında tuttu (saldıranın şansı %{#}). {#} saldıran ve {#} savunan düştü.'],
    ['{x} captured {x} from {x}.', '{x}, {x} kasabasını {x} hanedanından aldı.'], ['{x} captured {x}.', '{x}, {x} kasabasını aldı.'],
    ['{x} burned {x} outpost at {x}.', '{1}, {3} karesindeki karakolu yaktı.'], ['{x} has fallen. Their lands slip into anarchy.', '{x} düştü. Toprakları kargaşaya sürükleniyor.'],
    ['{x} founded the castle of {x}.', '{x}, {x} kalesini kurdu.'], ['{x} built a port at {x}.', '{x}, {x} karesine iskele kurdu.'],
    ['{x} could not pay the troops. {#} soldiers deserted.', '{x} askerlerin parasını ödeyemedi. {#} asker kaçtı.'], ['Enemy ships blockade {x}: its new warships wait in port.', 'Düşman gemileri {x} limanını kuşattı: yeni savaş gemileri limanda bekliyor.'],
    ["{x}'s fleet won a sea battle against {x} ({#}% odds).", '{x} filosu {x} karşısında deniz savaşını kazandı (şans %{#}).'],
    ["{x}'s fleet held the sea against {x} ({#}% odds for the attacker).", '{x} filosu {x} karşısında denizi tuttu (saldıranın şansı %{#}).'],
    ["{x}'s warships bombarded {x}: {#} soldiers of {x} fell.", '{1} savaş gemileri {2} karesini topa tuttu: {4} hanedanından {3} asker düştü.'], ["{x}'s warships bombarded {x}: {#} soldier of {x} fell.", '{1} savaş gemileri {2} karesini topa tuttu: {4} hanedanından {3} asker düştü.'],
    ["{x}'s warships fell on {x}'s transports: {#} soldiers drowned, none survived.", '{x} savaş gemileri {x} nakliye gemilerine saldırdı: {#} asker boğuldu, kurtulan olmadı.'],
    ["{x}'s warships fell on {x}'s transports: {#} soldiers drowned.", '{x} savaş gemileri {x} nakliye gemilerine saldırdı: {#} asker boğuldu.'],
    ["{x}'s soldiers fought off {x}'s warships from their transports.", '{x} askerleri {x} savaş gemilerini nakliye gemilerinden püskürttü.'],
    ['{x} put {#} soldiers aboard ships at {x}.', '{1}, {3} karesinde {2} askeri gemiye bindirdi.'], ['{x} put {#} soldier aboard ships at {x}.', '{1}, {3} karesinde {2} askeri gemiye bindirdi.'],
    ['{x} landed {#} soldiers at {x}.', '{1}, {3} karesine {2} asker çıkardı.'], ['{x} landed {#} soldier at {x}.', '{1}, {3} karesine {2} asker çıkardı.'],
    ['{x} proposed a deal to {x}: {x}.', '{x}, {x} hanedanına anlaşma önerdi: {x}.'], ["{x} declined {x}'s offer.", '{x}, {x} teklifini reddetti.'], ['{x} and {x} agreed: {x}.', '{x} ve {x} anlaştı: {x}.'],
    ['{x} could no longer pay, so the deal with {x} fell through.', '{x} artık ödeyemedi; {x} ile anlaşma bozuldu.'],
    ['{x} paid {#} gold of tribute to {x}.', '{1}, {3} hanedanına {2} altın haraç ödedi.'],
    ['{x} conquered the realm.', '{x} diyarı fethetti.'], ['{x} leads the realm when the chronicle closes.', 'Vakayiname kapanırken diyarın önderi {x}.'],
    ["{x}'s turn was skipped by the host.", '{x} sırası kurucu tarafından atlandı.'],
    // ---------------------------------------------------------------- terms (whole labels)
    ['Spearmen', 'Mızrakçılar'], ['Spearman', 'Mızrakçı'], ['Archers', 'Okçular'], ['Archer', 'Okçu'], ['Knight', 'Şövalye'], ['Swordsmen', 'Kılıççılar'], ['Swordsman', 'Kılıççı'], ['Cannon', 'Top'],
    ['Plains', 'Ova'], ['Forest', 'Orman'], ['Hills', 'Tepeler'], ['Mountains', 'Dağlar'], ['Sea', 'Deniz'], ['Distant land', 'Uzak diyar'], ['Desert', 'Çöl'],
    ['Being built', 'Yapılıyor'], ['being built · ready next turn', 'yapılıyor · sonraki sırada hazır'], ['ready next turn', 'sonraki sırada hazır'], ['Cancel and get {#} gold back', 'İptal et, {#} altın geri al'],
    ['Building: ready at the start of your next turn.', 'İnşaat: sonraki sıranın başında hazır.'], ['Something is already being built here.', 'Burada zaten bir şey yapılıyor.'], ['Already being built: ready next turn.', 'Zaten yapılıyor: sonraki sırada hazır.'],
    // choosing capitals
    ['Starting cities', 'Başkentler'], ['Placed at random', 'Rastgele yerleşir'], ['Each house picks, in a random order', 'Her hanedan sırayla seçer (kurayla)'], ['Each house picks', 'Her hanedan seçer'],
    ['Each house in turn chooses where its capital will stand.', 'Her hanedan sırayla başkentinin nerede kurulacağını seçer.'],
    ['{x} raised its capital at {x}.', '{1} başkentini kurdu: {2}.'],
    ['The game has already begun.', 'Oyun zaten başladı.'], ['Wait for your turn to choose.', 'Seçmek için sıranı bekle.'], ['Choose one of the marked sites.', 'İşaretli yerlerden birini seç.'],
    ['Too close to another house.', 'Başka bir hanedana çok yakın.'], ['No site left.', 'Boş yer kalmadı.'],
    ['choosing…', 'seçiyor…'], ['waits', 'bekliyor'], ['chose {x}', '{x} seçti'],
    ['{x} is choosing where to raise a capital.', '{x} başkentini nereye kuracağını seçiyor.'],
    ['Click one of the marked sites on the map. Your capital, its walls and a first army of 5 spearmen and 2 archers will be raised there.', 'Haritadaki işaretli yerlerden birine tıkla. Başkentin, surları ve 5 mızrakçı ile 2 okçudan ilk ordun orada kurulur.'],
    [' · on the coast', ' · kıyıda'], ['Land nearby', 'Yakın toprak'], ['Rivers', 'Nehirler'], ['Free towns near', 'Yakın bağımsız kasaba'],
    ['Raise your capital here', 'Başkentini buraya kur'], ['Choose your capital', 'Başkentini seç'], ['Choosing capitals', 'Başkentler seçiliyor'], ['Order of choosing', 'Seçim sırası'],
    ['{x}, choose your capital', '{x}, başkentini seç'], ['Pick one of the marked sites on the map. Houses choose one after another, in an order drawn by lot.', 'Haritadaki işaretli yerlerden birini seç. Hanedanlar kurayla belirlenen sırayla birbiri ardına seçer.'], ['Choose', 'Seç'],
    ['Houses are still choosing their capitals.', 'Hanedanlar hâlâ başkentlerini seçiyor.'],
    ['Click a marked site to choose where your capital will stand', 'Başkentinin kurulacağı yeri seçmek için işaretli bir yere tıkla'], ['{x} is choosing a capital site', '{x} başkent yeri seçiyor'],
    // occupied land going back
    ['{x} took back {#} tiles beside its strongholds once {x} marched off.', '{3} çekilince {1} kalelerinin yanındaki {2} kareyi geri aldı.'],
    ['{x} took back {#} tile beside its strongholds once {x} marched off.', '{3} çekilince {1} kalelerinin yanındaki {2} kareyi geri aldı.'],
    // battle report
    ['Attacker · {#}', 'Saldıran · {#}'], ['Defender · {#}', 'Savunan · {#}'], ['Each figure stands for about {#} soldiers.', 'Her figür yaklaşık {#} askeri gösterir.'],
    ['Fighting strength after luck: the longer bar wins.', 'Şanstan sonraki savaş gücü: uzun olan kazanır.'], ['How the strength was counted', 'Güç nasıl hesaplandı'], ['The two armies on the field', 'Meydandaki iki ordu'],
    ['Luck {#}: ×{x}', 'Şans {1}: ×{2}'],
    // marches queued ahead
    ['March queued. It sets off when your turn begins ({#} waiting).', 'Yürüyüş sıraya alındı. Sıran gelince yola çıkar ({#} bekliyor).'],
    ['March {#} was not carried out: the turn ended.', '{#}. yürüyüş yapılmadı: sıra bitti.'], ['March {#} cancelled: {x}.', '{1}. yürüyüş iptal: {2}.'],
    ['the army is gone', 'ordu artık yok'], ['the army is no longer where it stood', 'ordu artık durduğu yerde değil'], ['the army lost soldiers in a battle', 'ordu bir savaşta asker kaybetti'],
    ['the army is at sea', 'ordu denizde'], ['it cannot go there now', 'oraya şimdi gidemez'], ['new enemies stand in its way', 'yoluna yeni düşmanlar çıktı'],
    ['Queued marches', 'Sıradaki yürüyüşler'], ['{#} from {x} to {x}', '{1} asker, {2} → {3}'], ['gone', 'yok'], ['Remove this march', 'Bu yürüyüşü kaldır'],
    ['Run them one after another. A march whose army moved, fought or changed is cancelled.', 'Hepsini sırayla yürüt. Ordusu yer değiştiren, savaşan ya da değişen yürüyüş iptal edilir.'],
    ['Carry out {#} marches', '{#} yürüyüşü yap'], ['Carry out {#} march', '{#} yürüyüşü yap'], ['Plan ahead', 'Önceden planla'],
    ['While you wait, click one of your armies and paint its next march, then press <b>Queue march</b>. Queued marches run when your turn begins.', 'Beklerken ordularından birine tıkla ve sonraki yürüyüşünü boya, sonra <b>Sıraya al</b>’a bas. Sıradaki yürüyüşler sıran gelince yapılır.'],
    ['Queue march', 'Sıraya al'], ['Save this march; it sets off when your turn begins (Enter)', 'Bu yürüyüşü sakla; sıran gelince yola çıkar (Enter)'],
    ['Planning ahead: this march is saved, not made. Steps and orders are counted as at the start of your turn.', 'Önceden plan: bu yürüyüş yapılmadı, saklandı. Adımlar ve emirler sıranın başındaki gibi sayılır.'],
    ['Too close to a castle being built. Castles must be {#}+ tiles apart.', 'Yapılmakta olan bir kaleye çok yakın. Kaleler arasında en az {#} kare olmalı.'], ['Nothing like that is being built.', 'Böyle bir şey yapılmıyor.'],
    ['Trade on this lane', 'Bu yoldaki ticaret'], ['Block', 'Ablukaya al'], ['Stop blocking', 'Ablukayı kaldır'],
    [' · {#} routes, {#} gold a turn', ' · {#} yol, sırada {#} altın'], [' · {#} route, {#} gold a turn', ' · {#} yol, sırada {#} altın'],
    ['Let their trade pass again', 'Ticaretlerinin yeniden geçmesine izin ver'], ['Stop their ships here: their trade on this lane pays nothing while your warship stays', 'Gemilerini burada durdur: savaş gemin kaldıkça bu yoldaki ticaretleri hiçbir şey getirmez'],
    ["Blockade: {x}'s trade through here is cut.", 'Abluka: {x} hanedanının buradan geçen ticareti kesildi.'], ['Their trade passes again.', 'Ticaretleri yeniden geçiyor.'],
    ['You are at peace with them.', 'Onlarla barıştasın.'], ["{x}'s warships blockade the trade of {x}.", '{x} savaş gemileri {x} ticaretini ablukaya aldı.'],
    ['Fewer {x}', 'Daha az {x}'], ['More {x}', 'Daha çok {x}'], ['nobody', 'kimse'],
    ['· Harbor', '· Liman'], ['· Stables', '· Ahır'], ['· Barracks', '· Kışla'], ['· Foundry', '· Dökümhane'], ['Harbor, ', 'Liman, '], ['Stables, ', 'Ahır, '], ['Barracks, ', 'Kışla, '],
  ];

  // names drawn on the map and inside sentences
  const NAMES = [
    ['The Americas', 'Amerika'], ['Africa', 'Afrika'], ['Arabia', 'Arabistan'], ['India', 'Hindistan'], ['Cathay', 'Çin'],
    ['the New World', 'Yeni Dünya'], ['Brazil', 'Brezilya'], ['the Gold Coast', 'Altın Kıyısı'], ['Calicut', 'Kalikut'], ['Canton', 'Kanton'],
    ['Newfoundland', 'Yenifundland'], ['the Caribbean', 'Karayipler'], ['the River Plate', 'Gümüş Irmağı'], ['Senegal', 'Senegal'], ['Zanzibar', 'Zengibar'], ['Aden', 'Aden'], ['Hormuz', 'Hürmüz'], ['Gujarat', 'Gücerat'], ['Bengal', 'Bengal'], ['Tartary', 'Tataristan'], ['Peking', 'Pekin'],
    ['against rebels', 'asiler'], ['the Spice Isles', 'Baharat Adaları'], ['the Amber Coast', 'Kehribar Kıyısı'], ['the Silk Shore', 'İpek Kıyısı'], ['the Ivory Cape', 'Fildişi Burnu'], ['the Salt Reach', 'Tuz Kıyısı'], ['the Pearl Banks', 'İnci Sığlıkları'],
  ];
  // soldier counts written inside sentences, such as "5 spearmen, 2 archers"
  const UNITS_LOW = [['spearmen', 'mızrakçı'], ['spearman', 'mızrakçı'], ['archers', 'okçu'], ['archer', 'okçu'], ['knights', 'şövalye'], ['knight', 'şövalye'], ['swordsmen', 'kılıççı'], ['swordsman', 'kılıççı'], ['cannons', 'top'], ['cannon', 'top']];
  const UNIT_TR = ['Mızrakçılar', 'Okçular', 'Şövalyeler', 'Kılıççılar', 'Toplar'];
  const UNIT_DESC = [
    'Ucuz hat piyadesi. Mızrak duvarı süvari hücumunu durdurur ama kılıççılar onu yarar.',
    'Oklar her saldırıyı zayıflatır; kasaba surlarında iki kat güçlü savaşırlar. Açık alanda şövalyeler onları ezer.',
    'Ağır süvari: okçuları ve kılıççıları ezer, daha hızlı yürür; ama mızrak duvarı onları durdurur, orman, tepe ve surlar hücumu yavaşlatır. Ahır gerekir.',
    'Zırhlı piyade, saldırıda en iyisi: mızrak hatlarını yarar ama süvari onları ezer. Kışla gerekir.',
    'Kuşatma topu: kasabalara ×4, karakollara ×2,5, ama açık alanda zayıf. Toplu bir ordu 1 adım daha az yürür. Dökümhane gerekir.',
  ];

  CC.UNITS.forEach((d, k) => { if (UNIT_DESC[k]) TR.push([d.desc, UNIT_DESC[k]]); });
  TR.push(['Attack {x} · defense {x} · upkeep {x}.', 'Saldırı {x} · savunma {x} · bakım {x}.'], ['Attack {x} · defense {x}.', 'Saldırı {x} · savunma {x}.']);
  // ---------------------------------------------------------------- the matcher
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labels = new Map(), phrases = [];
  const isLabel = (en) => !/[{<]/.test(en) && /^[A-Za-z\u00C0-\u017E'&;#0-9 \u2713]+$/.test(en) && en.split(' ').length <= 3 && !/[.:!?]$/.test(en);
  function compile(en, tr) {
    if (isLabel(en)) { labels.set(en, tr); return; }
    for (const [e, t] of en.includes('&#39;') || !/['"&]/.test(en) ? [[en, tr]] : [[en, tr], [escHtml(en), escHtml(tr)]]) {
      const names = [];
      const parts = e.split(/(\{x\}|\{#\})/);
      let src = '';
      parts.forEach((p, k) => {
        if (p === '{x}') { names.push('x'); src += k === parts.length - 2 && parts[parts.length - 1] === '' ? '([^<>"]+)' : '([^<>"]*?)'; }
        else if (p === '{#}') { names.push('#'); src += '([−+-]?\\d[\\d.,]*)'; }
        else src += reEsc(p);
      });
      // a placeholder takes the n-th captured value, in English order, wherever Turkish puts it
      let n = 0;
      const out = t.replace(/\{(\d)\}|\{x\}|\{#\}/g, (m, d) => (d ? `$${d}` : `$${++n}`));
      const anchor = parts.filter((p) => p !== '{x}' && p !== '{#}').sort((a, b) => b.length - a.length)[0] || '';
      phrases.push({ re: new RegExp(src, 'g'), out, anchor, len: e.length, plain: !names.length });
    }
  }
  for (const [en, tr] of TR) compile(en, tr);
  phrases.sort((a, b) => b.len - a.len);
  const unitRe = new RegExp(`(\\d+) (${UNITS_LOW.map((u) => u[0]).join('|')})\\b`, 'g'), unitMap = new Map(UNITS_LOW);

  function phrasesIn(s) {
    for (const p of phrases) {
      if (p.anchor && s.indexOf(p.anchor) < 0) continue;
      s = s.replace(p.re, p.out);
    }
    return s;
  }
  const PLACE = { Fields: 'Ovası', Woods: 'Ormanı', Heights: 'Tepeleri', Ford: 'Geçidi', Mine: 'Madeni', Farms: 'Çiftlikleri', Waters: 'Suları' };
  function names(s) {
    for (const [en, tr] of NAMES) if (s.indexOf(en) >= 0) s = s.split(en).join(tr);
    s = s.replace(/\b([A-Z][a-zA-Z]+) (Fields|Woods|Heights|Ford|Mine|Farms|Waters)\b/g, (m, a, b) => `${a} ${PLACE[b]}`);
    return s.replace(unitRe, (m, n, u) => `${n} ${unitMap.get(u)}`);
  }
  const label = (txt) => {
    const k = txt.trim(), arrow = / [▾▴]$/.exec(k), base = arrow ? k.slice(0, -2) : k;
    const v = labels.get(base);
    return v == null ? txt : txt.replace(k, v + (arrow ? arrow[0] : ''));
  };
  // HTML: sentences first, then labels that fill a whole element or attribute
  I.html = function (s) {
    if (I.lang === 'en' || typeof s !== 'string' || !s) return s;
    s = names(phrasesIn(s));
    s = s.replace(/>([^<>]+)</g, (m, txt) => '>' + label(txt) + '<');
    s = s.replace(/(data-tip|aria-label|placeholder|title)="([^"]*)"/g, (m, a, v) => `${a}="${label(v)}"`);
    return s;
  };
  // plain text (hints, labels drawn on the map)
  I.text = function (s) {
    if (I.lang === 'en' || typeof s !== 'string' || !s) return s;
    return label(names(phrasesIn(s)));
  };
  CC.tr = (s) => I.text(s);
  I.unitDesc = (k, en) => (I.lang === 'tr' && UNIT_DESC[k]) || en;

  // every write of HTML or text goes through the translator
  const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) { ih.set.call(this, I.lang === 'en' ? v : I.html(v)); } });
  const tc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  Object.defineProperty(Node.prototype, 'textContent', { configurable: true, get() { return tc.get.call(this); }, set(v) { tc.set.call(this, I.lang === 'en' || typeof v !== 'string' ? v : I.text(v)); } });

  // the page's own markup: remember the English and lay the chosen language over it
  const orig = new WeakMap();
  I.applyStatic = function (root) {
    root = root || document.body;
    if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName))) continue;
      if (!orig.has(n)) orig.set(n, n.nodeValue);
      const en = orig.get(n);
      n.nodeValue = I.lang === 'en' ? en : I.text(en);
    }
    root.querySelectorAll('[aria-label],[title],[placeholder]').forEach((el) => {
      for (const a of ['aria-label', 'title', 'placeholder']) {
        if (!el.hasAttribute(a)) continue;
        const key = 'i18n' + a.replace(/-./g, (x) => x[1].toUpperCase());
        if (el.dataset[key] == null) el.dataset[key] = el.getAttribute(a);
        el.setAttribute(a, I.lang === 'en' ? el.dataset[key] : I.text(el.dataset[key]));
      }
    });
    document.documentElement.lang = I.lang;
  };

  // the Rules page, written out in Turkish
  I.rules = (R, UN) => `<h2>Nasıl oynanır</h2><p class="lead">Tek bir kaleden bir diyara büyü. Oyun son turdan sonra ya da tek bir hanedan kalınca biter.</p>
    <div class="rules">
      <section><h3>Sıran</h3><ul><li><b>Kasabalardan, çiftliklerden ve madenlerden</b> altın toplarsın; ordu bakımı düşülür.</li><li>İstediğin sırayla asker topla ve inşa et. Yapılar da askerler gibi bir sıra sürer: parası şimdi ödenir, sonraki sıranın başında biter (o zamana kadar iptal edebilirsin).</li><li>Her orduya bir yürüyüş ver. Bitince <b>Sırayı bitir</b>’e bas.</li></ul></section>
      <section><h3>Yürüyüş ve fetih</h3><ul><li>Bir sancağa tıkla, kimin yürüyeceğini seç, sonra haritada <b>kare boya</b>. Her şekil olur. Başka ordunun (ya da kasabanın) üstüne boyarsan ona katılır.</li><li>Askerler ve savaş gemileri bir sıra eğitim görür: parası şimdi ödenir, sonraki sıranın başında kasabada hazır olurlar. O zamana kadar kasaba panelinden iptal edip paranı tümüyle geri alabilirsin.</li><li>Bir kuvvet en çok <b>1 + asker/2</b> kare alır (şövalyeler iki sayılır, en çok ${R.capMax}).</li><li>Her ordunun sırada ${R.baseMP} adımı vardır (yalnız şövalyelerse ${R.cavalryMP}); bunu birkaç yürüyüşe bölebilir. Kendi toprağın dışında orman, tepe ve nehir 2 adımdır; kendi yolların hep 1. Alınabilecek toprak da bütün sıra için bir bütçedir.</li><li><b>Denetim bölgeleri:</b> sana ait olmayan her kasaba, kale ve karakol çevresindeki 6 kareyi denetler (ordular yalnızca kendi karelerini tutar). Bu karelerden birine giren ordu yalnızca kasabaya ya da karakola saldırabilir veya geldiği yoldan döner: oradan geçemez, orada duramaz. Düşman bölgesinde aldığın toprak, üstünde ordun durmuyorsa sıran bitince sahibine döner. Düşmanı boyamak saldırmak demektir. Kendi toprağın hiçbir zaman denetlenmez.</li><li>Savaş kazanmak fazladan adım yer: bozguna uğratmak 1, denk bir savaş 4 adım; büyük bir ordu küçüğünü ezince yürümeye devam edebilir. Savaş kaybeden ordunun o sıra hamlesi biter.</li><li>Büyük ordular biraz yavaştır: 26 askerden itibaren −1, 51’den itibaren −2 adım. Birleşen ordular, parçaların kalan adımlarının ortalamasını korur.</li><li>Sahip olmadığın toprağa her yürüyüş bir <b>yürüyüş emri</b> harcar: 2 + her kasaba için 1, en çok ${R.ordersMax}.</li></ul></section>
      <section><h3>Savaşlar</h3><ul><li>Boyadığın topraktaki düşmanlar en yakından başlayarak seninle savaşır.</li><li>Güç = asker × birim gücü × arazi, sur ve nehir çarpanları × şans.</li><li>Şans her taraf için 2d6’dır: 2 ×0,70, 7 ×1,00, 12 ×1,30 verir.</li><li>Kaybeden en az yarısını yitirir ve kaçar. Kazananın kaybı fark büyüdükçe azalır.</li></ul></section>
      <section><h3>Birimler</h3><ul>${UN.map((d, k) => `<li><b>${UNIT_TR[k] || d.name}</b> ${d.cost} altın · saldırı ${d.att} · savunma ${d.def}. ${UNIT_DESC[k] || d.desc}</li>`).join('')}<li>Sıra başına bakım: ${UN.map((d, k) => `${UNIT_TR[k] || d.name} ${d.upkeep}`).join(', ')}.</li></ul></section>
      <section><h3>Deniz ve ticaret</h3><ul><li><b>Limanı</b> olan kasaba <b>savaş gemisi</b> yapar (${R.shipCost} altın, sırada ${R.shipUpkeep}). Filoya tıkla, sonra bir deniz karesine tıkla: karadaki her şeyden hızlı, en çok ${R.fleetMP} kare gider; en çok ${R.riverShips} gemilik filolar nehirlerden de çıkabilir. Filoyu bölmek için panelinden kaç geminin gideceğini seç; tekrar birleşmek için kendi gemilerinin üstüne git. Savaşmak için düşman filosunun, batırmak için denizdeki düşman askerlerinin üstüne git.</li><li>Filo sırada bir kez yanındaki kıyıda duran düşman ordusunu <b>topa tutabilir</b>: her gemi 2d6 ile ${R.bombardHit}+ atınca (sur arkasında ${R.bombardWallHit}+) bir asker öldürür; karşılık veremezler.</li><li><b>Ticaret limanları</b> denizin açıklarındadır (Bilinen Dünya’da her uzak diyarın kıyılarında iki ile dört arası: Amerika, Afrika, Arabistan, Hindistan ve Çin, yalnızca denizden ulaşılır; Sahra geçilemez). Birinde savaş gemisi tutarsan her sıra altınını kazanırsın. Soluk noktalı <b>deniz yolları</b> ticaret yollarıdır: altın onlar boyunca, sonra en yakın limanına gider ve yol senin renginde yanar.</li><li><b>Abluka:</b> bir deniz yoluna savaş gemisi koy; paneli oradan geçen düşman ticaretini listeler. Bir hanedanın oradaki yollarını kesmek için <b>Ablukaya al</b>’a bas; yalnızca seçtiğin hanedanlar, sen orada kaldıkça gelir kaybeder. Kervan yolundaki düşman ordusu da o yolu keser. Barış ortakları ablukaya alınamaz.</li><li><b>Ticaret anlaşmaları</b> (Anlaşma’dan, barış gerekir) kasabaların arasındaki kervan ya da deniz yolundan iki hanedana da her sıra altın kazandırır. Sahip olduğun her pazar seviyesi her anlaşmana +${R.marketTrade} altın ekler (her biri en çok +${R.marketTradeMax}).</li></ul></section>
      <section><h3>Toprak ve ekonomi</h3><ul><li>Elindeki her ${R.tilesPerFarm} kareye bir <b>çiftlik</b>, ova ya da nehir kıyısına: +${R.farmIncome} altın (nehir kıyısında +${R.riverFarmBonus}).</li><li>Altın yataklarına <b>maden</b>: +${R.mineIncome} altın.</li><li>Ele geçirilen çiftlik ve madenler el değiştirir. Korumak için üstlerine asker koy (×${R.structureDef} çit).</li></ul></section>
      <section><h3>Kasabalar, surlar ve gemiler</h3><ul><li>Kasabalar altın, asker ve emir verir. Başkentin ${R.capitalIncome}, diğer kasabalar ${R.cityIncome} altın verir.</li><li><b>Surlar</b> savunmayı ×${R.walls.mult[3]}’e kadar artırır. Ele geçirilen kasaba bir sur seviyesi kaybeder.</li><li><b>Limanlı</b> kasabada ordular <b>gemiye binebilir</b> (${R.embarkBase} altın + asker başına ${R.embarkPer}, denizde her sıra asker başına ${R.seaUpkeep}). Denizde sırada ${R.transportMP} kare gider ve açık bir kıyıya çıkar; çıkarma sıralarını bitirir. Denizde savaşamazlar: onları yakalayan savaş gemileri çoğunu boğar.</li><li>Elindeki herhangi bir kıyı karesine <b>iskele</b> kur (${R.portCost} altın, sırada ${R.portUpkeep}): kıyı kasabası olmadan da orada savaş gemisi yapılır ve ordular gemiye biner.</li><li>Kendi toprağında, her kasabadan en az ${R.castleMinDist} kare uzakta ${R.castleCost} altına yeni <b>kale</b> kur.</li><li><b>Karakollar</b> (${R.outpostCost} altın, sırada ${R.outpostUpkeep}) çevresindeki 6 kareyi denetler. Onları ${R.outpostMilitia} milis savunur, oraya konan askerler ×${R.outpostDef} savaşır; ele geçirilen karakol yakılır.</li><li>Bütün kasabalarını kaybeden hanedan oyundan çıkar.</li></ul></section>
      <section><h3>Diplomasi</h3><ul><li>Diplomasi sekmesinde bir hanedanın yanındaki <b>Anlaşma</b>’ya basarak şimdi altın, ${R.tributeTurns} sıra boyunca her sıra altın (haraç) ve barış önerebilirsin.</li><li><b>Barış</b> ${R.peaceRounds} tur sürer ve bozulamaz: iki taraf da birbirinin toprağına yürüyemez ve bölgeleri birbirini engellemez.</li><li>Bilgisayar hanedanları hemen, insanlar kendi sıralarının başında cevap verir. Cevapsız teklifler bir tur sonra düşer.</li></ul></section>
      <section><h3>Kontroller</h3><ul><li>Sürükle: boya, ya da bir şey seçili değilse haritayı kaydır. Sağ tıkla sürüklemek siler. Shift-tık ordunun duracağı yeri seçer. Sağ tık inceler.</li><li>Bir ordu seçiliyken başka ordunu tıklamak onu seçer; birleşmek için Alt ile tıkla ya da yolu onun üstüne boya.</li><li>Dokunmatik ekranlar: incelemek için uzun bas.</li><li>Kaydırmak için tekerlek ya da iki parmak; yakınlaştırmak için kıstır, ctrl+tekerlek ya da +/− düğmeleri.</li><li><b>N</b> sonraki ordu · <b>Enter</b> yürü · <b>Esc</b> temizle · <b>E</b> sırayı bitir</li></ul></section>
    </div><div class="modal-actions"><button class="btn primary" type="button" data-close>Haritaya dön</button></div>`;

  // switching: online games carry on in place; otherwise the page reloads into the saved game
  I.set = function (lang) {
    if (lang === I.lang) return;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* not remembered */ }
    const app = CC.App;
    if (app && app.online) { I.lang = lang; I.applyStatic(); app.renderAll(); return; }
    location.reload();
  };
  // a small EN | TR switch, used on the start screen, the join prompt and the menu
  I.switcher = () => `<div class="seg lang-seg" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${I.lang === 'en'}">English</button><button type="button" data-lang="tr" aria-pressed="${I.lang === 'tr'}">Türkçe</button></div>`;
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-lang]'); if (b) I.set(b.dataset.lang); });
  const ready = () => I.applyStatic();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
