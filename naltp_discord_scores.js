async function fetchEuData(eu_url) {
	let eu = eu_url.substr(0,18) + 'data/' + eu_url.substr(18,eu_url.length);
	let json = await $.getJSON(eu, function(data){});

	let team1 = json['teams'][0]['name'];
	let team2 = json['teams'][1]['name'];
	let team1_score = json['teams'][0]['score'];
	let team2_score = json['teams'][1]['score'];
	let map = json['map']['name'];
	let winner = "";
	let OT = false;

	// check for OT (+5 for error)
	if (json['duration'] > 36005) {
		OT = true;
	}

	// find the winning team
	if (team1_score > team2_score) {
		winner = team1;
	} else {
		winner = team2;
	}


	// formatted as [team 1 name(string), team 1 score(int), team 2 name(string), team 2 score(int), winner(string), OT(bool), map(string)]
	let result = [team1,team1_score,team2,team2_score,winner,OT,map];

	return result;
}

// stolen from https://stackoverflow.com/questions/53726337/send-discord-webhook-without-jquery
function discord_message(webHookURL, message) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", webHookURL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(message);
}

const form = document.querySelector("#form");

form.addEventListener("submit", async function (event) {
	// stop form submission
	event.preventDefault();

	let urls = [];
	urls[0] = document.getElementById("g1").value;
	urls[1] = document.getElementById("g2").value;
	urls[2] = document.getElementById("g3").value;
	urls[3] = document.getElementById("g4").value;
	urls[4] = document.getElementById("g5").value;
	urls[5] = document.getElementById("g6").value;
	urls[6] = document.getElementById("g7").value;
	let week = document.getElementById("week").value;
	let webhook_url = document.getElementById("webhookURL").value;
	let youtube_url = document.getElementById("youtube").value;
	let twitch_url = document.getElementById("twitch").value;

	let results = [];
	// make an array of arrays with the results form 
	for (let i = 0; i < urls.length; i++) {
		if (urls[i] === "") {
			break;
		}
		else {
			let promise_val = await fetchEuData(urls[i]).then(function(result){
				results.push(result);
			}) 	
		}
	}

	let team1 = results[0][0];
	let team2 = results[0][2];


	let league_text = "";
	let league_color = 0;
	if (team1[0] === "M") {
		league_text = "Majors";
   		league_color = 247548;
	} else if (team1[0] === "N") {
		league_text = "Minors";
		league_color = 1515358;
	} else if (team1[0] === "A") {
		league_text = "Novice";
		league_color = 16745753;
	}

	let team1_cap_agg = 0;
	let team2_cap_agg = 0;
	let team1_pt_agg = 0;
	let team2_pt_agg = 0;

	// build output json
	let output = {
		"embeds": [ 
			{
			"title": (league_text + " Week " + week + " : " + team1 + " vs " + team2),
			"description": "",
			"color": league_color,
			"fields": [],
			}
		]
	};


	// Some output formatting things
	let VOD_seperator = " | ";
	if (youtube_url === "" || twitch_url === "") {
		VOD_seperator = "";
	}

	let youtube_text = "[**Youtube**]"
	let twitch_text = "[**Twitch**]"

	if (youtube_url === "") {
		youtube_text = "";
	} else {
		youtube_text += "(" + youtube_url + ")"
	}
	if (twitch_url === "") {
		twitch_text = "";
	} else {
		twitch_text += "(" + twitch_url + ")"
	}

	// add VOD links to output
	output["embeds"][0]["description"] += youtube_text + VOD_seperator + twitch_text + "\n";

	// fill out output[description] with game scores
	// results[i] formatted as [0: team 1 name(string), 1: team 1 score(int), 2: team 2 name(string), 3: team 2 score(int), 4: winner(string), 5: OT(bool), 6: map(string)]
	for (let i = 0; i < results.length; i++) {
		let game = results[i];
		
		// make it so that the higher score is always on the left
		let higher_score;
		let lower_score;
		if (game[1] > game[3]) {
			higher_score = game[1];
			lower_score = game[3];
		} else {
			higher_score = game[3];
			lower_score = game[1];
		}

		// jus sum formatting things (make sure scores align even with double digit scores)
		let higher_score_space = "";
		let lower_score_space = "";

		if (higher_score < 10) {
			higher_score_space = " ";
		}

		if (lower_score < 10) {
			lower_score_space = " ";
		}

		let OT_asterisk = " ";
		let OT = game[5];
		if (OT) {
			OT_asterisk = "*";
		}

		// aggregate points
		if (game[4] === team1 ) {
			team1_pt_agg += 3;
			if (OT) {
				team1_pt_agg -= 1;
				team2_pt_agg += 1;
			}
		} else if (game[4] === team2) {
			team2_pt_agg += 3;
			if (OT) {
				team2_pt_agg -= 1;
				team1_pt_agg += 1;
			}
		}

		// aggregate caps
		if (game[0] === team1) {
			team1_cap_agg += game[1];
			team2_cap_agg += game[3];
		} else if (game[0] === team2) {
			team2_cap_agg += game[1];
			team1_cap_agg += game[3];
		}

		// add game #i scoreline / formatting and all
		output["embeds"][0]["description"] += "[`Game " + (i+1) + ": " + game[4] + OT_asterisk + " " + higher_score_space + higher_score + " - " + lower_score + lower_score_space + " | " + game[6] + "`](" + urls[i] + ")\n";

	}

	let team1_cap_diff = team1_cap_agg - team2_cap_agg;
	let team2_cap_diff = team2_cap_agg - team1_cap_agg;

	output["embeds"][0]["description"] += "**Aggregate Points:** " + team1 + " **" + team1_pt_agg + " - " + team2_pt_agg + "** " + team2 + "\n";
	output["embeds"][0]["description"] += "**Aggregate Caps:** " + team1 + "(" + team1_cap_diff + ") " + "**" + team1_cap_agg + " - " + team2_cap_agg + "** " + team2 + "(" + team2_cap_diff + ")";


	console.log(JSON.stringify(output));

	discord_message(webhook_url, JSON.stringify(output));
})





