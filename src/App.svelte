<script>
  let redPlayerPoints = 0;
  let bluePlayerPoints = 0;

  $: blueWon = redPlayerPoints <= 0 && bluePlayerPoints > 0;
  $: redWon = bluePlayerPoints <= 0 && redPlayerPoints > 0;

  function startGame() {
    redPlayerPoints = 20;
    bluePlayerPoints = 20;
  }

  function updateScore(player, score) {
    if (redWon || blueWon) {
      return;
    }

    if (player == "red") {
      redPlayerPoints += score;
      return;
    }

    bluePlayerPoints += score;

    return;
  }

  const plusRed = updateScore.bind(null, "red").bind(null, 1);
  const minusRed = updateScore.bind(null, "red").bind(null, -1);
  const plusBlue = updateScore.bind(null, "blue").bind(null, 1);
  const minusBlue = updateScore.bind(null, "blue").bind(null, -1);
</script>

<style>
  #container {
    width: 80%;
    padding: 20px;
    border: solid gray 1px;
    margin: 0 auto;
    background-color: wheat;
    margin: 10vh auto;
  }
  #red-player {
    color: red;
  }
  #blue-player {
    color: blue;
  }
  #controls-container {
    display: flex;
  }
  .player {
    flex-grow: 1;
  }
  button {
    font-size: 20px;
    border-radius: 3px;
    width: 40px;
    color: white;
    font-family: monospace;
    font-weight: bold;
  }
  .minus {
    background-color: seagreen;
  }
  .plus {
    background-color: brown;
  }
  button#start_game {
    display: block;
    width: 100%;
    margin-top: 20px;
    border: solid salmon 1px;
    background-color: sandybrown;
    color: rgb(61, 56, 56);
  }
</style>

<svelte:head>
  <title>MTG Game Counter</title>
</svelte:head>

<div id="container">
  <h1>Magic The Gather Game Counter</h1>
  <div id="controls-container">
    <div class="player" id="red-player">
      <h2 id="red-player-point">{redPlayerPoints}</h2>
      <button class="plus" on:click={plusRed}>+</button>
      <button class="minus" on:click={minusRed}>-</button>
      {#if redWon}
        <h2 id="red-wins-text">Red Wins</h2>
      {/if}
    </div>
    <div class="player" id="blue-player">
      <h2 id="blue-player-point">{bluePlayerPoints}</h2>
      <button class="plus" on:click={plusBlue}>+</button>
      <button class="minus" on:click={minusBlue}>-</button>
      {#if blueWon}
        <h2 id="blue-wins-text">Blue Wins</h2>
      {/if}
    </div>
  </div>
  <button on:click={startGame} id="start_game">Start Game</button>
</div>
