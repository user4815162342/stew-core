Stew Folder and Data Structure:
-------------------------------

For reference, in case you can't get to the tools, this is how a stew project is
organized.

Stew makes use of something called Simple File Metadata System (SFMS), described
elsewhere, which groups related sets of files into packets. Basically, a packet
is a set of files in the same folder, all of which share the same name up to the
last '_' (underscore) or '.' (period) in their file name. The '.' marks a file
extension, which you may be familiar with. The '_' similarly marks what is
referred to as a descriptor, which helps explain that files relationship to the
rest of the packet. A file without a descriptor is considered a 'primary' file,
and usually contains the content for the file. Files with descriptors are
usually called 'attachments'.

### Stew Project:

The following is the structure of a stew project. Files marked with '?' are
optional. Files with arbitrary names or parts of names are marked with
'\<...\>', where the text describes what's expected to be in the part of the
name. Directories are marked by ending the name with a backslash. Further
description appears after.

-   `<stew project folder>/`: The stew project folder is identified by stew
    tools as a folder containing the _stew.json file.

    -   `_stew.json`: This contains important properties for the entire project,
        such as known status names and a few other things. This is described
        further below.

    -   `_properties.json?`: This contains properties for the root folder of the
        project, it is the same as a `<folder>_properties.json` file as
        described under documents, as applied to the root folder.

    -   `_notes.<ext>?`: This file contains notes for the root folder of the
        project, it is the same as a `<document>_notes.<ext>` file, described
        under documents, as applied to the root folder.

    -   `_tags/?`: This folder contains settings and information about tags used
        in stew. See tags for more information.

    -   `_templates/?`: This folder contains blank file "templates" for certain
        document types.

    -   `<document>?`: All other 'packets' in the root directory make up the
        definition of documents contained directly in the root folder.

In SFMS, a file that starts with an underscore is used to define metadata for a
folder when it's necessary to keep that data inside the folder. Keeping them
here allows you to keep your parent documents folder clean and makes it simple
to backup or archive the project with just one drag and drop. It also makes it
easier for more advanced users to make use of a version control or file
synchronization system.

### `_stew.json`

Affectionately known as the stew file, this file identifies a folder as a stew
project, and contains data for the project. The data is stored in JSON format.
The following properties are known:

-   `categories`: The settings for known categories in which documents can be
    placed. The value is a JSON object, with each property on the object being a
    category. The property value of the category is a JSON object containing the
    properties of the category, right now consisting only of a 'color' property
    which describes how a stew tool might display files of that category.

The use of the categories is up to the user, but the intention is to use them to
classify different types of documents. Each document can only have one category,
and the category can be indicated with a color in the user interface. I use it
to specify what the contents of the document are: a chapter, a scene, a thought,
a task, etc. A document can be given a category that's not in this list, which
only means that that category has no properties.

-   `statuses`: A list of known statuses which can be set on documents. The
    value is a JSON array of strings, listing each known status, potentially in
    workflow order.

The use of statuses is up to the user, but the intention is to use them to
indicate workflow for a given document. Each document can only have one status,
and there is an implied order in the statuses that a document can have. A
document can be given a status that isn't in this list, such statuses are seen
as out of the normal workflow.

-   `defaultCategory`: Specifies the category a document is assumed to be in if
    no category is specified.

-   `defaultStatus`: Specifies the status a document is assumed to have if no
    status is specified.

-   `references`: A list of references for the project. This is not currently
    utilized, but it might be used for, say, a list of prior works, a
    bibliography, or a "see also" section. Web references are expected to
    contain a URL and a title. However it's used, it should not conflict with
    references kept in a `_properties.json` file for the root folder.

### `_tags/`

The `_tags` directory is used to store properties and information about known
tags. The use of tags are up to the user, but the intention is to use them to
mark the documents with useful information. Each document can have multiple
tags, and the tags themselves can be classified in a hierarchy, so you can group
different tags together. I use them to specify things like what characters,
props and settings are used in the scene. A document can be given a tag that's
not in this hierarchy.

Each packet in the tags directory is a 'tag', and contains metadata about what
that tag means. Each tag packet can have the following files:

-   `<tag name>/?`: A directory containing additional tags grouped into this
    tag.

-   `<tag name>_properties.json?`: Contains "properties" assigned to the tag.
    This includes a property of color, which can be used by a stew
    tool to change how a document might be displayed.

-   `<tag name>.<ext>?`: Contains information about the tag. This could be used
    to summarize what this tag is for. A user might be tempted to use the tag to
    describe a character in his or her novel, but this is not recommended. Tags
    are intended for simple data, more complex data like characters should be
    kept in documents, perhaps with a special "character" category.

### `_templates/`

Some stew tools are used to create new files and open them immediately for
editing. Some applications which edit files will take a nonexistent filename as
a parameter, and create a new file on its own. Other applications can not work
with a non-existent file, which means that when you open up the new file, at
worst you will get an error, at best you will still have to find where the
document is supposed to go when you save.

This folder contains blank files which can be used as templates for these
applications. When creating a new file, the stew tools are passed an extension. 
They will look in this directory for a file named `blank.<ext>`, then copy
it into place with the new name, and open it. The application will see
an existing file and when you save, it will save to the right place.

There is also a set of these files built into the application itself,
so this folder is primarily used for overriding or adding to that set.

In the future, this folder may be able to serve something more than just 
blank files.

### `<document>`

Each document in a stew project might have the following known files and
structures. Each item is optional. However, a document does not exist unless it
has at least one of these things. If a document does not contain a primary file,
but does have metadata, it is simply assumed to have an empty primary document.
There are some minimal restrictions to how a document can be named, mostly
because of characters which can not be used as file names in certain operating
systems.

-   `<document>/`: If the document is a folder (a document can be both a folder
    and have file content), this is where it's content documents are placed.

-   `<document>.<ext>`: The primary content for the document. If the document is
    text content, this might be a text file or word processor file. It might
    also be an image, or an audio file. The extension should indicate the file
    format. It is up to the user what formats should be used.

-   `<document>_synopsis.txt`: This is a synopsis describing the document. The
    text inside might be used by various stew tools to describe the document on
    a corkboard, graph or organizer.

-   `<document>_thumbnail.<ext>`: This is a thumbnail which can represent the
    document. An appropriate extension should be used to indicate the format of
    the thumbnail. The image might be used by various stew tools to represent
    the document on a corkboard, graph or organizer. If multiple thumbnails are
    used, with different extensions, they should only differ in format, not in
    content.

-   `<document>_notes.<ext>`: This can be used to contain notes related to the
    document, research for example, or a brief task list. The extension should
    represent the format, and there is no reason the format has to be the same
    as the primary document.

-   `<document>_properties.json`: This is used to record simple metadata for a
    document. The properties are stored in JSON format. The following properties
    are used:

    -   `references`: This is used to create references and links between
        documents in the same stew project, and with outside resources. The
        value is an array of objects, each with a title property and either a
        file property (specifying the patch to another document relative to the
        root of the stew project folder) or a url.

    -   `category`: This specifies the name of the category this document
        belongs to. For more information, see the categories member of
        `_stew.json`.

    -   `status`: This specifies the name of the status this document has
        reached. For more information, see the statuses member of `_stew.json`.

    -   `tags`: This is an array of tags. Each item is a string specifying the
        path for the tag relative to the root of the _tags directory. For more
        information, see the information on the `_tags` folder.

    -   `index`: This will usually appear on documents which are folders. The
        index is an array of document names contained within the folder, which
        specifies the expected order of the documents within it. If a document
        appears in the folder, but not in this property, it will be sorted to
        the end of the list.

    -   `publish`: This is a boolean value which indicates whether this document
        is intended for publishing. Certain stew tools will use this flag to
        decide whether to export the document to a file or printer.

    -   `<anything else>`: The user may add other properties to this file as
        well to track custom data. Some of these properties may be brought
        forward from automated conversion tools to represent data that stew does
        not track. However, additional properties may be added to stew in the
        future, and there is no guarantee that they might not conflict. One
        recommendation is to place user-defined properties inside a property
        named 'user', to avoid this.

-   `<document>_backup-<timestamp or id>.<ext>`: This is the recommended way of
    creating a simple backup or archive of the document itself. If a timestamp
    is used, it should be in a format that is easy to sort, such as ISO 8601,
    with colons converted to hyphens to ensure a valid file name.

-   `<document>_<anything else>.<ext>`: The user may add additional attachments
    to the document, using any descriptor name he wants (descriptors should not
    contain underscores or periods). This can be used to create custom data
    documents, create new sections for long documents or complex structured
    notes (such as character information), or any number of other things. These
    files may also be created by automated conversion tools to represent data
    stew does not track. Note that addition attachments may be added to stew in
    the future, and there's no guarantee that they might not conflict, but this
    should be rare enough that the user shouldn't have to worry about them
    except when converting to a new version of the tools.
