import { EventEmitter } from "events";
import { Collection, Snowflake, User } from "discord.js";
import { Node } from "./Node";
import { Player } from "./Player";
import {
    ManagerOptions,
    PlayerOptions,
    SearchQuery,
    SearchResult,
    TrackData,
} from "../Static/Interfaces";

/**
 * The Manager Class which manages all the players.
 * 
 * @extends {EventEmitter}
 * @example
 * const manager = new Manager({
 *     node: { host: "localhost", port: 3000, password: "MySecurePassword" },
 *     send(id, payload) {
 *          client.guilds.cache.get(id).shards.send(payload);
 *     }
 * })
 */
export class Manager extends EventEmitter {
    /**
     * The Collection of Players in this Manager.
     * @type {Collection<Snowflake, Player>}
     */
    public readonly players = new Collection<Snowflake, Player>();

    /**
     * The Node of the manager.
     * @type {Node}
     */
    public node: Node;

    /**
     * The options received from the constructor for the Manager.
     * @type {ManagerOptions}
     */
    public readonly options: ManagerOptions;

    /**
     * Boolean stating is the Manager Class initiated or not.
     * @type {boolean}
     * @private
     */
    private initiated = false;

    /**
     * Nexus Access Token for the REST API calls.
     * @type {string}
     */
    public access_token: string;

    /**
     * Creates new Manager Instance
     * @param {ManagerOptions} options The options which are necessary for the Manager.
     * @example
     * const manager = new Manager({
     *     node: { host: "localhost", port: 3000, password: "MySecurePassword" },
     *     send(id, payload){
     *          client.guilds.cache.get(id).shards.send(payload);
     *     }
     * })
     */
    constructor(options: ManagerOptions) {
        super();

        Player.init(this);
        Node.initStaticManager(this);

        this.options = {
            node: { identifier: "default", host: "localhost" },
            ...options,
        };

        if (this.options.node) new Node(this.options.node);
    }

    /**
     * Initiate the manager.
     * 
     * @param {Snowflake} clientID Bot Application ID
     * @returns {Manager}
     * @example
     * manager.init(client.user.id);
     */
    public init(clientID: Snowflake): this {
        if (!this.initiated) {
            if (clientID) this.options.clientID = clientID;
            this.node.connect();
            this.initiated = true;
        }

        return this;
    }

    /**
     * Search youtube for songs and playlists.
     * 
     * @param {SearchQuery} SearchQuery Query Object
     * @param {User} requester User Object
     * @returns {SearchResult}
     * @example
     * const results = await player.search({ query: "Play that funky music" }, message.author);
     * console.log(results);
     */
    public async search(searchQuery: SearchQuery, requester: User): Promise<SearchResult> {
        const response = await this.node
            .makeRequest("GET", `api/tracks/search?query=${encodeURIComponent(searchQuery.query)}&identifier=${searchQuery.identifier || 'ytsearch'}`,)
            .then(res => res.json());

        return this.resolveTrackData(response, requester)
    }

    /**
     * Internal method to resolve search results from nexus rest api into SearchResult Interface.
     * 
     * @param {Object} res search result
     * @param {User} requester user who searched
     * @returns {SearchResult}
     * @private
     * @ignore
     */
    private resolveTrackData(res: any, requester: User) {
        if (!res.results.length) {
            const SearchResult: SearchResult = {
                type: "NO_RESULT",
                tracks: [],
                requester: requester,
            };
            return SearchResult;
        }
        if (res.identifier === "ytsearch" || "scsearch") {
            const SearchResult: SearchResult = {
                type: "SEARCH_RESULT",
                tracks: res.results,
                requester: requester,
            };
            return SearchResult;
        } else {
            const SearchResult: SearchResult = {
                type: "PLAYLIST",
                playlist: {
                    title: res.results[0].title,
                    id: res.results[0].id,
                    url: res.results[0].url,
                    author: res.results[0].author,
                    extractor: res.results[0].extractor,
                },
                tracks: res.results[0].tracks.map((track: TrackData) =>
                    this.buildTrackData(track, requester)
                ),
                requester: requester,
            };
            return SearchResult;
        }
    }

    /**
     * @ignore
     * @description Internal method to encapsulate Track Data received from Nexus into {TrackData}
     * @param {TrackData} data The Track details received from Nexus
     * @param {User} requester The person who requested it
     * @returns {TrackData}
     * @private
     */
    private buildTrackData(data: TrackData, requester: User) {
        const track: TrackData = {
            url: data.url,
            title: data.title,
            thumbnail: data.thumbnail,
            duration: data.duration,
            author: data.author,
            created_at: data.created_at,
            extractor: data.extractor,
            requested_by: requester,
        };
        return track;
    }

    /**
     * Creates a player instance and add it to players collection
     * @param {PlayerOptions} options Player Options
     * @returns {Player}
     *
     */
    public create(options: PlayerOptions): Player {
        if (this.players.has(options.guild)) {
            return this.players.get(options.guild);
        }
        return new Player(options);
    }

    /**
     * Send Player
     * @param {Snowflake} guild ID of Guild
     * @returns {Player}
     */
    public get(guild: Snowflake): Player | undefined {
        return this.players.get(guild);
    }
    /**
     * Destroy the Node connection
     */
    public destroyNode(): void {
        this.node.destroy();
    }

    /**
     * Send Voice State Payload Received from Discord API to Nexus
     * @param {Object} data
     * @example
     * client.on('raw', (d)=>{
     *    manager.updateVoiceState(d);
     * });
     */
    public updateVoiceState(data: any): void {
        if (
            !data ||
            !["VOICE_SERVER_UPDATE", "VOICE_STATE_UPDATE"].includes(
                data.t || ""
            )
        )
            return;
        if (data.t === "VOICE_SERVER_UPDATE") {
            this.node.socket.send(JSON.stringify(data));
        }
        if (data.t === "VOICE_STATE_UPDATE") {
            this.node.socket.send(JSON.stringify(data));
        }
    }
}

/**
 * Emitted when node connection is established
 * @event Manager#nodeConnect
 * @param {Node} node
 */

/**
 * Emitted when node connection is disconnected
 * @event Manager#nodeDisconnect
 * @param {Node} node
 */

/**
 * Emitted when node connection errors
 * @event Manager#nodeError
 * @param {Node} node
 */

/**
 * Emitted when Nexus is Ready to play
 * @event Manager#ready
 */

/**
 * Emitted when track is added to the queue
 * @event Manager#trackADD
 * @param {Player} player
 * @param {TrackData} Track
 */

/**
 * Emitted when tracks is added to the queue
 * @event Manager#tracksADD
 * @param {Player} player
 * @param {TrackData[]} Tracks
 */

/**
 * Emitted when track is start playing
 * @event Manager#trackStart
 * @param {Player} player
 * @param {TrackData} Track
 */

/**
 * Emitted when track is ends
 * @event Manager#trackEnd
 * @param {Player} player
 * @param {TrackData} Track
 */

/**
 * Emitted when track errors
 * @event Manager#trackError
 * @param {Player} player
 * @param {TrackData} Track
 */

/**
 * Emitted when Queue ends
 * @event Manager#queueEnd
 * @param {Player} player
 * @param {Payload} payload
 */

/**
 * Emitted when Voice Connection is Ready
 * @event Manager#voiceReady
 * @param {Payload} payload
 */

/**
 * Emitted when Voice Connection is disconnected
 * @event Manager#voiceDisconnect
 * @param {Payload} payload
 */

/**
 * Emitted when Voice Connection error
 * @event Manager#voiceError
 * @param {Payload} payload
 */

/**
 * Emitted when Audio Player Errors
 * @event Manager#audioPlayerError
 * @param {Payload} payload
 */

/**
 * @typedef {Object} ManagerOptions
 * @param {NodeOptions} [node] Node Options
 * @param {Snowflake} [clientID] Bot Application ID
 */

/**
 * A Twitter snowflake, except the epoch is 2015-01-01T00:00:00.000Z
 * ```
 * If we have a snowflake '266241948824764416' we can represent it as binary:
 *
 * 64                                          22     17     12          0
 *  000000111011000111100001101001000101000000  00001  00000  000000000000
 *       number of ms since Discord epoch       worker  pid    increment
 * ```
 * @typedef {string} Snowflake
 */

/**
 * @typedef {Object} SearchQuery
 * @param {string} identifier='ytsearch' IDentifier of type of query
 * @param {string} query Query to be searched for
 */

/**
 * @typedef {Object} SearchResult
 * @param {SEARCH_RESULT | PLAYLIST | NO_RESULT} type Type Of Search Result
 * @param {PlaylistInfo} [playlist] Playlist info
 * @param {Array<TrackData>} Array of Tracks
 * @param {User} requester User who requested it
 */

/**
 * @typedef {Object} PlaylistInfo
 * @param {string} id  ID Of Playlist
 * @param {string} title Title of Playlist
 * @param {string} url URL of Playlist
 * @param {string} author Uploader of the playlist
 * @param {string} extractor Website playlist is fetched from
 */

/**
 * @typedef {Object} TrackData
 * @param {string} url URL of the Track
 * @param {string} title Title of the Track
 * @param {string} [thumbnail] Image of the Track
 * @param {number} duration Duration of the Track
 * @param {string} author Uploader of the Track
 * @param {Date} created_at Track upload date
 * @param {string} extractor Website track is fetched from
 * @param {User} requested_by User who requested it
 */
